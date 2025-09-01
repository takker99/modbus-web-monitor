// Handler Registry for Modbus Function Codes
// Provides dynamic loading and management of function code handlers

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import { err } from "../types/result.ts";

// Import all handlers
import { readCoils, type ReadCoilsRequest, type ReadCoilsOptions } from "./read-coils.ts";
import { readDiscreteInputs, type ReadDiscreteInputsRequest, type ReadDiscreteInputsOptions } from "./read-discrete-inputs.ts";
import { readHoldingRegisters, type ReadHoldingRegistersRequest, type ReadHoldingRegistersOptions } from "./read-holding-registers.ts";
import { readInputRegisters, type ReadInputRegistersRequest, type ReadInputRegistersOptions } from "./read-input-registers.ts";
import { writeSingleCoil, type WriteSingleCoilRequest, type WriteSingleCoilOptions } from "./write-single-coil.ts";
import { writeSingleRegister, type WriteSingleRegisterRequest, type WriteSingleRegisterOptions } from "./write-single-register.ts";
import { writeMultipleCoils, type WriteMultipleCoilsRequest, type WriteMultipleCoilsOptions } from "./write-multiple-coils.ts";
import { writeMultipleRegisters, type WriteMultipleRegistersRequest, type WriteMultipleRegistersOptions } from "./write-multiple-registers.ts";

// Handler function signatures
export type ReadHandler<TRequest, TOptions> = (
  transport: IModbusTransport,
  request: TRequest,
  options?: TOptions,
) => Promise<Result<ModbusResponse, Error>>;

export type WriteHandler<TRequest, TOptions> = (
  transport: IModbusTransport,
  request: TRequest,
  options?: TOptions,
) => Promise<Result<void, Error>>;

// Handler metadata
export interface HandlerMetadata {
  functionCode: number;
  name: string;
  description: string;
  type: "read" | "write";
  maxQuantity?: number;
  dataType: "bit" | "register";
}

// Registry entry structure
interface ReadHandlerEntry<TRequest, TOptions> {
  metadata: HandlerMetadata;
  handler: ReadHandler<TRequest, TOptions>;
}

interface WriteHandlerEntry<TRequest, TOptions> {
  metadata: HandlerMetadata;
  handler: WriteHandler<TRequest, TOptions>;
}

type HandlerEntry = 
  | ReadHandlerEntry<any, any>
  | WriteHandlerEntry<any, any>;

/**
 * Central registry for all Modbus function code handlers
 */
export class ModbusHandlerRegistry {
  private static readonly handlers = new Map<number, HandlerEntry>();
  private static initialized = false;

  /**
   * Initialize the registry with all built-in handlers
   */
  static initialize(): void {
    if (this.initialized) {
      return;
    }

    // Register read handlers
    this.registerReadHandler(1, {
      functionCode: 1,
      name: "Read Coils",
      description: "Read the ON/OFF status of discrete outputs (coils)",
      type: "read",
      maxQuantity: 2000,
      dataType: "bit",
    }, readCoils);

    this.registerReadHandler(2, {
      functionCode: 2,
      name: "Read Discrete Inputs",
      description: "Read the ON/OFF status of discrete inputs",
      type: "read",
      maxQuantity: 2000,
      dataType: "bit",
    }, readDiscreteInputs);

    this.registerReadHandler(3, {
      functionCode: 3,
      name: "Read Holding Registers",
      description: "Read the contents of holding registers",
      type: "read",
      maxQuantity: 125,
      dataType: "register",
    }, readHoldingRegisters);

    this.registerReadHandler(4, {
      functionCode: 4,
      name: "Read Input Registers",
      description: "Read the contents of input registers",
      type: "read",
      maxQuantity: 125,
      dataType: "register",
    }, readInputRegisters);

    // Register write handlers
    this.registerWriteHandler(5, {
      functionCode: 5,
      name: "Write Single Coil",
      description: "Force a single coil to ON or OFF",
      type: "write",
      dataType: "bit",
    }, writeSingleCoil);

    this.registerWriteHandler(6, {
      functionCode: 6,
      name: "Write Single Register",
      description: "Write a single holding register",
      type: "write",
      dataType: "register",
    }, writeSingleRegister);

    this.registerWriteHandler(15, {
      functionCode: 15,
      name: "Write Multiple Coils",
      description: "Force multiple coils to ON or OFF",
      type: "write",
      maxQuantity: 1968,
      dataType: "bit",
    }, writeMultipleCoils);

    this.registerWriteHandler(16, {
      functionCode: 16,
      name: "Write Multiple Registers",
      description: "Write multiple holding registers",
      type: "write",
      maxQuantity: 123,
      dataType: "register",
    }, writeMultipleRegisters);

    this.initialized = true;
  }

  /**
   * Register a read handler
   */
  private static registerReadHandler<TRequest, TOptions>(
    functionCode: number,
    metadata: HandlerMetadata,
    handler: ReadHandler<TRequest, TOptions>,
  ): void {
    this.handlers.set(functionCode, {
      metadata,
      handler,
    });
  }

  /**
   * Register a write handler
   */
  private static registerWriteHandler<TRequest, TOptions>(
    functionCode: number,
    metadata: HandlerMetadata,
    handler: WriteHandler<TRequest, TOptions>,
  ): void {
    this.handlers.set(functionCode, {
      metadata,
      handler,
    });
  }

  /**
   * Get handler metadata for a function code
   */
  static getHandlerMetadata(functionCode: number): HandlerMetadata | undefined {
    this.initialize();
    const entry = this.handlers.get(functionCode);
    return entry?.metadata;
  }

  /**
   * Get all registered handler metadata
   */
  static getAllHandlerMetadata(): HandlerMetadata[] {
    this.initialize();
    return Array.from(this.handlers.values()).map(entry => entry.metadata);
  }

  /**
   * Check if a function code is supported
   */
  static isSupported(functionCode: number): boolean {
    this.initialize();
    return this.handlers.has(functionCode);
  }

  /**
   * Get supported function codes
   */
  static getSupportedFunctionCodes(): number[] {
    this.initialize();
    return Array.from(this.handlers.keys()).sort((a, b) => a - b);
  }

  /**
   * Execute a read operation using the appropriate handler
   */
  static async executeRead(
    functionCode: number,
    transport: IModbusTransport,
    request: any,
    options?: any,
  ): Promise<Result<ModbusResponse, Error>> {
    this.initialize();
    
    const entry = this.handlers.get(functionCode);
    if (!entry) {
      return err(new Error(`Unsupported function code: ${functionCode}`));
    }

    if (entry.metadata.type !== "read") {
      return err(new Error(`Function code ${functionCode} is not a read operation`));
    }

    return (entry.handler as ReadHandler<any, any>)(transport, request, options);
  }

  /**
   * Execute a write operation using the appropriate handler
   */
  static async executeWrite(
    functionCode: number,
    transport: IModbusTransport,
    request: any,
    options?: any,
  ): Promise<Result<void, Error>> {
    this.initialize();
    
    const entry = this.handlers.get(functionCode);
    if (!entry) {
      return err(new Error(`Unsupported function code: ${functionCode}`));
    }

    if (entry.metadata.type !== "write") {
      return err(new Error(`Function code ${functionCode} is not a write operation`));
    }

    return (entry.handler as WriteHandler<any, any>)(transport, request, options);
  }

  /**
   * Get handlers by type
   */
  static getHandlersByType(type: "read" | "write"): HandlerMetadata[] {
    this.initialize();
    return Array.from(this.handlers.values())
      .filter(entry => entry.metadata.type === type)
      .map(entry => entry.metadata);
  }

  /**
   * Get handlers by data type
   */
  static getHandlersByDataType(dataType: "bit" | "register"): HandlerMetadata[] {
    this.initialize();
    return Array.from(this.handlers.values())
      .filter(entry => entry.metadata.dataType === dataType)
      .map(entry => entry.metadata);
  }
}

// Export convenience functions that use the registry
export async function executeReadOperation(
  functionCode: number,
  transport: IModbusTransport,
  request: any,
  options?: any,
): Promise<Result<ModbusResponse, Error>> {
  return ModbusHandlerRegistry.executeRead(functionCode, transport, request, options);
}

export async function executeWriteOperation(
  functionCode: number,
  transport: IModbusTransport,
  request: any,
  options?: any,
): Promise<Result<void, Error>> {
  return ModbusHandlerRegistry.executeWrite(functionCode, transport, request, options);
}

// Export all request and option types for convenience
export type {
  ReadCoilsRequest,
  ReadCoilsOptions,
  ReadDiscreteInputsRequest,
  ReadDiscreteInputsOptions,
  ReadHoldingRegistersRequest,
  ReadHoldingRegistersOptions,
  ReadInputRegistersRequest,
  ReadInputRegistersOptions,
  WriteSingleCoilRequest,
  WriteSingleCoilOptions,
  WriteSingleRegisterRequest,
  WriteSingleRegisterOptions,
  WriteMultipleCoilsRequest,
  WriteMultipleCoilsOptions,
  WriteMultipleRegistersRequest,
  WriteMultipleRegistersOptions,
};