import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SerialManager } from '../src/serial.ts'

// Mock Web Serial API
class MockSerialPort {
  private isOpen = false
  private readerController = new AbortController()
  private writerController = new AbortController()
  private mockReader: MockReader | null = null
  private mockWriter: MockWriter | null = null

  get readable() {
    if (!this.isOpen) return null
    this.mockReader = new MockReader(this.readerController)
    return {
      getReader: () => this.mockReader
    } as any
  }

  get writable() {
    if (!this.isOpen) return null
    this.mockWriter = new MockWriter(this.writerController)
    return {
      getWriter: () => this.mockWriter
    } as any
  }

  async open(_config: any) {
    if (this.isOpen) throw new Error('Port already open')
    this.isOpen = true
  }

  async close() {
    this.isOpen = false
  }

  // Test helper methods
  simulateDisconnect() {
    this.isOpen = false
    if (this.mockReader) {
      this.mockReader.simulateDisconnect()
    }
    if (this.mockWriter) {
      this.mockWriter.simulateDisconnect()
    }
  }

  simulateReadError(error: Error) {
    if (this.mockReader) {
      this.mockReader.simulateError(error)
    }
  }
}

class MockReader {
  private disconnected = false
  private errorToThrow: Error | null = null

  constructor(private controller: AbortController) {}

  async read(): Promise<{ value?: Uint8Array; done: boolean }> {
    if (this.errorToThrow) {
      const error = this.errorToThrow
      this.errorToThrow = null
      throw error
    }

    if (this.disconnected) {
      return { done: true }
    }

    // Simulate a delay then return some data
    await new Promise(resolve => setTimeout(resolve, 10))
    
    if (this.controller.signal.aborted) {
      throw new Error('Reader cancelled')
    }

    return { value: new Uint8Array([1, 2, 3]), done: false }
  }

  async cancel() {
    this.controller.abort()
  }

  releaseLock() {
    // Mock implementation
  }

  simulateDisconnect() {
    this.disconnected = true
  }

  simulateError(error: Error) {
    this.errorToThrow = error
  }
}

class MockWriter {
  private disconnected = false

  constructor(private controller: AbortController) {}

  async write(_data: Uint8Array) {
    if (this.disconnected) {
      throw new Error('Port disconnected')
    }
    if (this.controller.signal.aborted) {
      throw new Error('Writer cancelled')
    }
    // Mock successful write
  }

  async close() {
    this.controller.abort()
  }

  simulateDisconnect() {
    this.disconnected = true
  }
}

// Mock navigator.serial
const mockNavigator = {
  serial: {
    requestPort: vi.fn()
  }
}

describe('SerialManager Disconnect Handling', () => {
  let serialManager: SerialManager
  let mockPort: MockSerialPort

  beforeEach(() => {
    // Setup navigator mock
    vi.stubGlobal('navigator', mockNavigator)
    
    serialManager = new SerialManager()
    mockPort = new MockSerialPort()
    mockNavigator.serial.requestPort.mockResolvedValue(mockPort as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('should detect unexpected disconnect when read stream ends', async () => {
    const portDisconnectedEvents: any[] = []
    const disconnectedEvents: any[] = []

    serialManager.on('portDisconnected', () => {
      portDisconnectedEvents.push(true)
    })

    serialManager.on('disconnected', () => {
      disconnectedEvents.push(true)
    })

    // Select and connect
    await serialManager.selectPort()
    await serialManager.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    expect(serialManager.connected).toBe(true)

    // Simulate sudden disconnect (e.g., cable unplugged)
    mockPort.simulateDisconnect()

    // Wait for the read loop to detect the disconnect
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(portDisconnectedEvents).toHaveLength(1)
    expect(disconnectedEvents).toHaveLength(0) // Should NOT emit regular disconnect
    expect(serialManager.connected).toBe(false)
  })

  it('should handle read errors that indicate disconnection', async () => {
    const portDisconnectedEvents: any[] = []
    const errorEvents: any[] = []

    serialManager.on('portDisconnected', () => {
      portDisconnectedEvents.push(true)
    })

    serialManager.on('error', (error) => {
      errorEvents.push(error)
    })

    // Select and connect
    await serialManager.selectPort()
    await serialManager.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    // Simulate a disconnection error
    mockPort.simulateReadError(new Error('Device disconnected'))

    // Wait for error to be processed
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(portDisconnectedEvents).toHaveLength(1)
    expect(errorEvents).toHaveLength(0) // Should NOT emit generic error for disconnect
    expect(serialManager.connected).toBe(false)
  })

  it('should handle non-disconnect read errors normally', async () => {
    const portDisconnectedEvents: any[] = []
    const errorEvents: any[] = []

    serialManager.on('portDisconnected', () => {
      portDisconnectedEvents.push(true)
    })

    serialManager.on('error', (error) => {
      errorEvents.push(error)
    })

    // Select and connect
    await serialManager.selectPort()
    await serialManager.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    // Simulate a non-disconnect error
    mockPort.simulateReadError(new Error('Invalid data format'))

    // Wait for error to be processed
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(portDisconnectedEvents).toHaveLength(0) // Should NOT trigger disconnect
    expect(errorEvents).toHaveLength(1) // Should emit generic error
    expect(serialManager.connected).toBe(true) // Should remain connected
  })

  it('should allow safe idempotent disconnection', async () => {
    const disconnectedEvents: any[] = []

    serialManager.on('disconnected', () => {
      disconnectedEvents.push(true)
    })

    // Select and connect
    await serialManager.selectPort()
    await serialManager.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    // Disconnect multiple times should be safe
    await serialManager.disconnect()
    expect(disconnectedEvents).toHaveLength(1)
    expect(serialManager.connected).toBe(false)

    // Second disconnect should be safe and not emit event
    await serialManager.disconnect()
    expect(disconnectedEvents).toHaveLength(1) // No additional event
    expect(serialManager.connected).toBe(false)
  })

  it('should support reconnection after unexpected disconnect', async () => {
    const connectedEvents: any[] = []
    const portDisconnectedEvents: any[] = []

    serialManager.on('connected', () => {
      connectedEvents.push(true)
    })

    serialManager.on('portDisconnected', () => {
      portDisconnectedEvents.push(true)
    })

    // Select and connect
    await serialManager.selectPort()
    await serialManager.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    expect(connectedEvents).toHaveLength(1)

    // Simulate disconnect
    mockPort.simulateDisconnect()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(portDisconnectedEvents).toHaveLength(1)
    expect(serialManager.connected).toBe(false)

    // Reconnect should work
    await serialManager.reconnect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })

    expect(connectedEvents).toHaveLength(2)
    expect(serialManager.connected).toBe(true)
  })

  it('should handle reconnection when no port is available', async () => {
    // Don't select a port first
    await expect(serialManager.reconnect({
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    })).rejects.toThrow('No port available for reconnection')
  })
})