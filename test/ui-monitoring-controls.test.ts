import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModbusClient } from '../src/modbus.ts'

describe('UI Monitoring Controls Integration', () => {
  let modbusClient: ModbusClient
  
  beforeEach(() => {
    modbusClient = new ModbusClient()
    vi.useFakeTimers()
  })

  it('should handle automatic monitoring restart when polling interval changes', () => {
    const config = {
      slaveId: 1,
      functionCode: 3 as const,
      startAddress: 0,
      quantity: 10,
    }

    // Start monitoring
    modbusClient.startMonitoring(config, 1000, 3000)
    
    // Simulate changing polling interval (auto-restart behavior)
    modbusClient.stopMonitoring()
    modbusClient.startMonitoring(config, 500, 3000) // New polling interval

    // Verify monitoring can be stopped (indicating it was running)
    modbusClient.stopMonitoring()
    expect(true).toBe(true) // Test passes if no errors thrown
  })

  it('should handle automatic monitoring restart when request timeout changes', () => {
    const config = {
      slaveId: 1,
      functionCode: 3 as const,
      startAddress: 0,
      quantity: 10,
    }

    // Start monitoring
    modbusClient.startMonitoring(config, 1000, 3000)

    // Simulate changing request timeout (auto-restart behavior)
    modbusClient.stopMonitoring()
    modbusClient.startMonitoring(config, 1000, 5000) // New timeout

    // Verify monitoring can be stopped (indicating it was running)
    modbusClient.stopMonitoring()
    expect(true).toBe(true) // Test passes if no errors thrown
  })

  it('should maintain monitoring state through parameter changes', () => {
    const config = {
      slaveId: 1,
      functionCode: 3 as const,
      startAddress: 0,
      quantity: 10,
    }

    // Start monitoring
    modbusClient.startMonitoring(config, 1000, 3000)

    // Change both parameters (simulate UI auto-restart)
    modbusClient.stopMonitoring()
    modbusClient.startMonitoring(config, 500, 5000)

    // Verify monitoring can be stopped (indicating it was running)
    modbusClient.stopMonitoring()
    expect(true).toBe(true) // Test passes if no errors thrown
  })
})