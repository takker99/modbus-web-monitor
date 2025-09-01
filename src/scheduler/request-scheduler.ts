// Request Scheduler for Modbus RTU Protocol
// Implements request serialization, queuing, priority, and retry logic

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import { err } from "../types/result.ts";
import { executeReadOperation, executeWriteOperation } from "../handlers/index.ts";
import { executeWithRetry, type RetryOptions } from "../handlers/common.ts";

/**
 * Request priority levels
 */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Request types for the scheduler
 */
export interface ReadSchedulerRequest {
  type: "read";
  functionCode: number;
  request: any;
  options?: any;
  priority: RequestPriority;
  retryOptions?: RetryOptions;
}

export interface WriteSchedulerRequest {
  type: "write";
  functionCode: number;
  request: any;
  options?: any;
  priority: RequestPriority;
  retryOptions?: RetryOptions;
}

export type SchedulerRequest = ReadSchedulerRequest | WriteSchedulerRequest;

/**
 * Internal request structure with additional metadata
 */
interface InternalRequest {
  id: string;
  schedulerRequest: SchedulerRequest;
  timestamp: Date;
  resolve: (result: Result<any, Error>) => void;
  reject: (error: Error) => void;
  attempts: number;
  maxAttempts: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  maxConcurrentRequests: number; // For RTU this should be 1
  defaultTimeout: number;
  defaultRetryOptions: RetryOptions;
  queueSizeLimit: number;
  requestIntervalMs: number; // Minimum interval between requests
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  queueLength: number;
  activeRequests: number;
  averageResponseTime: number;
  uptime: number;
}

/**
 * Request Scheduler for RTU protocol
 * Ensures proper serialization of requests and implements advanced queuing
 */
export class RequestScheduler {
  private readonly config: SchedulerConfig;
  private readonly transport: IModbusTransport;
  private readonly queue: InternalRequest[] = [];
  private readonly activeRequests = new Set<InternalRequest>();
  private readonly stats: SchedulerStats;
  private running = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private lastRequestTime = 0;
  private startTime = Date.now();

  constructor(transport: IModbusTransport, config: Partial<SchedulerConfig> = {}) {
    this.transport = transport;
    this.config = {
      maxConcurrentRequests: 1, // RTU requires serialization
      defaultTimeout: 3000,
      defaultRetryOptions: {
        maxRetries: 2,
        baseDelay: 100,
        exponentialBackoff: true,
        retryableErrors: ["ModbusTimeoutError", "ModbusContextError", "NetworkError"],
      },
      queueSizeLimit: 100,
      requestIntervalMs: 10, // 10ms minimum interval between requests
      ...config,
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      queueLength: 0,
      activeRequests: 0,
      averageResponseTime: 0,
      uptime: 0,
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.startTime = Date.now();
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.requestIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Reject all pending requests
    for (const request of this.queue) {
      request.reject(new Error("Scheduler stopped"));
    }
    this.queue.length = 0;

    for (const request of this.activeRequests) {
      request.reject(new Error("Scheduler stopped"));
    }
    this.activeRequests.clear();
  }

  /**
   * Schedule a read request
   */
  async scheduleRead(
    functionCode: number,
    request: any,
    options?: any,
    priority: RequestPriority = RequestPriority.NORMAL,
    retryOptions?: RetryOptions,
  ): Promise<Result<ModbusResponse, Error>> {
    const schedulerRequest: ReadSchedulerRequest = {
      type: "read",
      functionCode,
      request,
      options,
      priority,
      retryOptions,
    };

    return this.scheduleRequest(schedulerRequest);
  }

  /**
   * Schedule a write request
   */
  async scheduleWrite(
    functionCode: number,
    request: any,
    options?: any,
    priority: RequestPriority = RequestPriority.NORMAL,
    retryOptions?: RetryOptions,
  ): Promise<Result<void, Error>> {
    const schedulerRequest: WriteSchedulerRequest = {
      type: "write",
      functionCode,
      request,
      options,
      priority,
      retryOptions,
    };

    return this.scheduleRequest(schedulerRequest);
  }

  /**
   * Schedule a generic request
   */
  private async scheduleRequest(schedulerRequest: SchedulerRequest): Promise<Result<any, Error>> {
    if (!this.transport.connected) {
      return err(new Error("Transport not connected"));
    }

    if (!this.running) {
      return err(new Error("Scheduler not running"));
    }

    if (this.queue.length >= this.config.queueSizeLimit) {
      return err(new Error("Request queue is full"));
    }

    return new Promise((resolve, reject) => {
      const internalRequest: InternalRequest = {
        id: this.generateRequestId(),
        schedulerRequest,
        timestamp: new Date(),
        resolve,
        reject,
        attempts: 0,
        maxAttempts: (schedulerRequest.retryOptions?.maxRetries ?? this.config.defaultRetryOptions.maxRetries) + 1,
      };

      // Insert request into queue based on priority
      this.insertByPriority(internalRequest);
      this.stats.totalRequests++;
      this.updateQueueStats();
    });
  }

  /**
   * Insert request into queue based on priority
   */
  private insertByPriority(request: InternalRequest): void {
    let insertIndex = this.queue.length;
    
    // Find the correct position based on priority
    for (let i = 0; i < this.queue.length; i++) {
      if (request.schedulerRequest.priority > this.queue[i].schedulerRequest.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, request);
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (!this.running || !this.transport.connected) {
      return;
    }

    // Check if we can process more requests
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      return;
    }

    // Check minimum interval between requests
    const now = Date.now();
    if (now - this.lastRequestTime < this.config.requestIntervalMs) {
      return;
    }

    // Get next request from queue
    const internalRequest = this.queue.shift();
    if (!internalRequest) {
      return;
    }

    this.updateQueueStats();
    this.activeRequests.add(internalRequest);
    this.lastRequestTime = now;

    // Execute the request
    this.executeRequest(internalRequest);
  }

  /**
   * Execute a single request
   */
  private async executeRequest(internalRequest: InternalRequest): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { schedulerRequest } = internalRequest;
      const retryOptions = schedulerRequest.retryOptions ?? this.config.defaultRetryOptions;

      const operation = async (): Promise<Result<any, Error>> => {
        if (schedulerRequest.type === "read") {
          return executeReadOperation(
            schedulerRequest.functionCode,
            this.transport,
            schedulerRequest.request,
            schedulerRequest.options,
          );
        } else {
          return executeWriteOperation(
            schedulerRequest.functionCode,
            this.transport,
            schedulerRequest.request,
            schedulerRequest.options,
          );
        }
      };

      const result = await executeWithRetry(operation, retryOptions);
      
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeStats(responseTime);

      if (result.success) {
        this.stats.successfulRequests++;
        internalRequest.resolve(result);
      } else {
        this.stats.failedRequests++;
        internalRequest.resolve(result); // Still resolve with error result
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeStats(responseTime);
      this.stats.failedRequests++;
      internalRequest.reject(error as Error);
    } finally {
      this.activeRequests.delete(internalRequest);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update queue statistics
   */
  private updateQueueStats(): void {
    this.stats.queueLength = this.queue.length;
    this.stats.activeRequests = this.activeRequests.size;
    this.stats.uptime = Date.now() - this.startTime;
  }

  /**
   * Update response time statistics
   */
  private updateResponseTimeStats(responseTime: number): void {
    const totalCompleted = this.stats.successfulRequests + this.stats.failedRequests;
    if (totalCompleted === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      // Calculate running average
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (totalCompleted - 1) + responseTime) / totalCompleted;
    }
  }

  /**
   * Get current scheduler statistics
   */
  getStats(): SchedulerStats {
    this.updateQueueStats();
    return { ...this.stats };
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    for (const request of this.queue) {
      request.reject(new Error("Queue cleared"));
    }
    this.queue.length = 0;
    this.updateQueueStats();
  }

  /**
   * Get queue contents (for debugging)
   */
  getQueueContents(): Array<{
    id: string;
    type: string;
    functionCode: number;
    priority: RequestPriority;
    timestamp: Date;
    attempts: number;
  }> {
    return this.queue.map(req => ({
      id: req.id,
      type: req.schedulerRequest.type,
      functionCode: req.schedulerRequest.functionCode,
      priority: req.schedulerRequest.priority,
      timestamp: req.timestamp,
      attempts: req.attempts,
    }));
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}