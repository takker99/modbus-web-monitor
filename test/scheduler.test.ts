// Tests for Request Scheduler
// Tests the new request scheduling and queuing system

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { RequestScheduler, RequestPriority } from "../src/scheduler/request-scheduler.ts";
import { isOk, isErr } from "../src/types/result.ts";

describe("Request Scheduler", () => {
  let transport: MockTransport;
  let scheduler: RequestScheduler;

  beforeEach(() => {
    transport = new MockTransport({
      type: "mock",
      autoConnect: true,
      responses: [],
    });
    
    scheduler = new RequestScheduler(transport, {
      maxConcurrentRequests: 1,
      defaultTimeout: 1000,
      queueSizeLimit: 10,
      requestIntervalMs: 10,
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("Basic Scheduling", () => {
    it("should start and stop correctly", () => {
      expect(scheduler.isRunning()).toBe(false);
      
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it("should schedule read requests", async () => {
      transport.setMockResponse([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x08, 0xF4, 0x03]);
      scheduler.start();
      
      const result = await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 2,
      });
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.functionCode).toBe(3);
      }
    });

    it("should schedule write requests", async () => {
      transport.setMockResponse([0x01, 0x05, 0x00, 0xAC, 0xFF, 0x00, 0x4E, 0x8B]);
      scheduler.start();
      
      const result = await scheduler.scheduleWrite(5, {
        unitId: 1,
        address: 172,
        value: true,
      });
      
      expect(isOk(result)).toBe(true);
    });

    it("should reject requests when not running", async () => {
      const result = await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 2,
      });
      
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("not running");
      }
    });

    it("should reject requests when transport disconnected", async () => {
      transport.disconnect();
      scheduler.start();
      
      const result = await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 2,
      });
      
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("not connected");
      }
    });
  });

  describe("Request Priority", () => {
    it("should prioritize high priority requests", async () => {
      transport.setMockResponse([0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84]);
      scheduler.start();
      
      const results: Array<{ priority: RequestPriority; timestamp: number }> = [];
      
      // Schedule requests in mixed priority order
      const promises = [
        scheduler.scheduleRead(3, { unitId: 1, address: 1, quantity: 1 }, {}, RequestPriority.LOW)
          .then(() => results.push({ priority: RequestPriority.LOW, timestamp: Date.now() })),
        scheduler.scheduleRead(3, { unitId: 1, address: 2, quantity: 1 }, {}, RequestPriority.CRITICAL)
          .then(() => results.push({ priority: RequestPriority.CRITICAL, timestamp: Date.now() })),
        scheduler.scheduleRead(3, { unitId: 1, address: 3, quantity: 1 }, {}, RequestPriority.HIGH)
          .then(() => results.push({ priority: RequestPriority.HIGH, timestamp: Date.now() })),
        scheduler.scheduleRead(3, { unitId: 1, address: 4, quantity: 1 }, {}, RequestPriority.NORMAL)
          .then(() => results.push({ priority: RequestPriority.NORMAL, timestamp: Date.now() })),
      ];
      
      // Set mock responses for all requests
      transport.setMockResponses([
        [0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84],
        [0x01, 0x03, 0x02, 0x00, 0x02, 0x39, 0x85],
        [0x01, 0x03, 0x02, 0x00, 0x03, 0xF8, 0x44],
        [0x01, 0x03, 0x02, 0x00, 0x04, 0xB9, 0x86],
      ]);
      
      await Promise.all(promises);
      
      // Check that CRITICAL was processed first, then HIGH, then NORMAL, then LOW
      expect(results[0].priority).toBe(RequestPriority.CRITICAL);
      expect(results[1].priority).toBe(RequestPriority.HIGH);
      expect(results[2].priority).toBe(RequestPriority.NORMAL);
      expect(results[3].priority).toBe(RequestPriority.LOW);
    });
  });

  describe("Request Serialization", () => {
    it("should serialize requests for RTU protocol", async () => {
      scheduler.start();
      
      const startTime = Date.now();
      const timestamps: number[] = [];
      
      // Schedule multiple requests
      const promises = Array.from({ length: 3 }, (_, i) => 
        scheduler.scheduleRead(3, { unitId: 1, address: i, quantity: 1 })
          .then(() => timestamps.push(Date.now()))
      );
      
      // Set mock responses
      transport.setMockResponses([
        [0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84],
        [0x01, 0x03, 0x02, 0x00, 0x02, 0x39, 0x85],
        [0x01, 0x03, 0x02, 0x00, 0x03, 0xF8, 0x44],
      ]);
      
      await Promise.all(promises);
      
      // Verify requests were processed sequentially with proper intervals
      const totalTime = timestamps[timestamps.length - 1] - startTime;
      expect(totalTime).toBeGreaterThan(20); // At least 2 * 10ms intervals
      
      // Each request should be at least 10ms apart
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i] - timestamps[i - 1]).toBeGreaterThanOrEqual(8); // Allow some tolerance
      }
    });

    it("should respect max concurrent requests limit", async () => {
      const singleRequestScheduler = new RequestScheduler(transport, {
        maxConcurrentRequests: 1,
      });
      
      singleRequestScheduler.start();
      
      try {
        const stats = singleRequestScheduler.getStats();
        expect(stats.activeRequests).toBe(0);
        
        // The mock transport will delay responses, so concurrent limit will be tested
        const promise1 = singleRequestScheduler.scheduleRead(3, { unitId: 1, address: 0, quantity: 1 });
        
        // Check that one request is active
        await new Promise(resolve => setTimeout(resolve, 5));
        const statsAfter = singleRequestScheduler.getStats();
        expect(statsAfter.activeRequests).toBeLessThanOrEqual(1);
        
        transport.setMockResponse([0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84]);
        await promise1;
      } finally {
        singleRequestScheduler.stop();
      }
    });
  });

  describe("Error Handling & Retry", () => {
    it("should retry failed requests", async () => {
      scheduler.start();
      
      let attemptCount = 0;
      transport.onSend = () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Network error");
        }
      };
      
      transport.setMockResponse([0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84]);
      
      const result = await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 1,
      }, {}, RequestPriority.NORMAL, {
        maxRetries: 2,
        baseDelay: 10,
        exponentialBackoff: false,
        retryableErrors: ["Error"],
      });
      
      expect(isOk(result)).toBe(true);
      expect(attemptCount).toBe(3); // Initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
      scheduler.start();
      
      let attemptCount = 0;
      transport.onSend = () => {
        attemptCount++;
        const error = new Error("Fatal error");
        error.name = "FatalError";
        throw error;
      };
      
      const result = await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 1,
      }, {}, RequestPriority.NORMAL, {
        maxRetries: 2,
        baseDelay: 10,
        exponentialBackoff: false,
        retryableErrors: ["NetworkError"], // FatalError not in list
      });
      
      expect(isErr(result)).toBe(true);
      expect(attemptCount).toBe(1); // No retries for non-retryable error
    });
  });

  describe("Queue Management", () => {
    it("should reject requests when queue is full", async () => {
      const smallQueueScheduler = new RequestScheduler(transport, {
        queueSizeLimit: 1,
      });
      
      smallQueueScheduler.start();
      
      try {
        // Fill the queue
        smallQueueScheduler.scheduleRead(3, { unitId: 1, address: 0, quantity: 1 });
        
        // This should be rejected
        const result = await smallQueueScheduler.scheduleRead(3, { unitId: 1, address: 1, quantity: 1 });
        
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.message).toContain("queue is full");
        }
      } finally {
        smallQueueScheduler.stop();
      }
    });

    it("should clear queue", async () => {
      scheduler.start();
      
      // Add requests to queue (don't await them)
      scheduler.scheduleRead(3, { unitId: 1, address: 0, quantity: 1 });
      scheduler.scheduleRead(3, { unitId: 1, address: 1, quantity: 1 });
      
      await new Promise(resolve => setTimeout(resolve, 5)); // Let them queue up
      
      const statsBefore = scheduler.getStats();
      expect(statsBefore.queueLength).toBeGreaterThan(0);
      
      scheduler.clearQueue();
      
      const statsAfter = scheduler.getStats();
      expect(statsAfter.queueLength).toBe(0);
    });

    it("should provide queue inspection", async () => {
      scheduler.start();
      
      // Add requests with different priorities
      scheduler.scheduleRead(3, { unitId: 1, address: 0, quantity: 1 }, {}, RequestPriority.HIGH);
      scheduler.scheduleRead(3, { unitId: 1, address: 1, quantity: 1 }, {}, RequestPriority.LOW);
      
      await new Promise(resolve => setTimeout(resolve, 5)); // Let them queue up
      
      const queueContents = scheduler.getQueueContents();
      expect(queueContents.length).toBeGreaterThan(0);
      
      // Verify queue structure
      for (const item of queueContents) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("type");
        expect(item).toHaveProperty("functionCode");
        expect(item).toHaveProperty("priority");
        expect(item).toHaveProperty("timestamp");
      }
    });
  });

  describe("Statistics", () => {
    it("should track request statistics", async () => {
      transport.setMockResponse([0x01, 0x03, 0x02, 0x00, 0x01, 0x79, 0x84]);
      scheduler.start();
      
      const statsBefore = scheduler.getStats();
      expect(statsBefore.totalRequests).toBe(0);
      expect(statsBefore.successfulRequests).toBe(0);
      
      await scheduler.scheduleRead(3, {
        unitId: 1,
        address: 0,
        quantity: 1,
      });
      
      const statsAfter = scheduler.getStats();
      expect(statsAfter.totalRequests).toBe(1);
      expect(statsAfter.successfulRequests).toBe(1);
      expect(statsAfter.averageResponseTime).toBeGreaterThan(0);
    });

    it("should track failed requests", async () => {
      scheduler.start();
      
      transport.onSend = () => {
        throw new Error("Network error");
      };
      
      try {
        await scheduler.scheduleRead(3, {
          unitId: 1,
          address: 0,
          quantity: 1,
        }, {}, RequestPriority.NORMAL, {
          maxRetries: 0, // No retries
          baseDelay: 10,
          exponentialBackoff: false,
        });
      } catch {
        // Expected to fail
      }
      
      const stats = scheduler.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
    });
  });

  describe("Configuration", () => {
    it("should use provided configuration", () => {
      const config = {
        maxConcurrentRequests: 5,
        defaultTimeout: 5000,
        queueSizeLimit: 50,
        requestIntervalMs: 20,
      };
      
      const customScheduler = new RequestScheduler(transport, config);
      const actualConfig = customScheduler.getConfig();
      
      expect(actualConfig.maxConcurrentRequests).toBe(5);
      expect(actualConfig.defaultTimeout).toBe(5000);
      expect(actualConfig.queueSizeLimit).toBe(50);
      expect(actualConfig.requestIntervalMs).toBe(20);
      
      customScheduler.stop();
    });

    it("should use default configuration when not provided", () => {
      const defaultScheduler = new RequestScheduler(transport);
      const config = defaultScheduler.getConfig();
      
      expect(config.maxConcurrentRequests).toBe(1); // RTU default
      expect(config.defaultTimeout).toBe(3000);
      expect(config.queueSizeLimit).toBe(100);
      
      defaultScheduler.stop();
    });
  });
});