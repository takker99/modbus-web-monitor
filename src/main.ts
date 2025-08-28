import { ModbusClient } from './modbus.ts'
import { SerialManager } from './serial.ts'
import { UIManager } from './ui.ts'

class ModbusWebMonitor {
  private serialManager: SerialManager
  private modbusClient: ModbusClient
  private uiManager: UIManager

  constructor() {
    this.serialManager = new SerialManager()
    this.modbusClient = new ModbusClient()
    this.uiManager = new UIManager()

    this.init()
  }

  private init() {
    console.log('ModbusWebMonitor: initialization start')

    // Check Web Serial API support
    if (!('serial' in navigator)) {
      console.error('Web Serial API not supported')
      alert(
        'This browser does not support the Web Serial API. Please use Chrome 89+.'
      )
      return
    }

    console.log('Web Serial API is supported')
    this.setupEventListeners()
    this.uiManager.updateConnectionStatus('Disconnected')
    console.log('ModbusWebMonitor: initialization complete')
  }

  private setupEventListeners() {
    // Serial connection related events
    this.serialManager.on('portSelected', () => {
      console.log('ModbusWebMonitor: port selected - enabling connect button')
      this.uiManager.enablePortSelection(true)
    })

    this.serialManager.on('connected', () => {
      this.uiManager.updateConnectionStatus('Connected')
      this.uiManager.enableControls(true)
    })

    this.serialManager.on('disconnected', () => {
      this.uiManager.updateConnectionStatus('Disconnected')
      this.uiManager.enableControls(false)
      // Port remains selected so connect button stays enabled
      this.uiManager.enablePortSelection(true)
    })

    this.serialManager.on('error', (error: Error) => {
      this.uiManager.logError(`Serial communication error: ${error.message}`)
    })

    this.serialManager.on('data', (data: Uint8Array) => {
      this.modbusClient.handleResponse(data)
    })

    // Modbus communication related events
    this.modbusClient.on('response', (data) => {
      this.uiManager.displayData(data)
    })

    this.modbusClient.on('error', (error: Error) => {
      this.uiManager.logError(`Modbus communication error: ${error.message}`)
    })

    this.modbusClient.on('request', (data: Uint8Array) => {
      this.serialManager.send(data)
      this.uiManager.logCommunication('Sent', data)
    })

    // UI related events
    this.uiManager.on('portSelect', async () => {
      try {
        await this.serialManager.selectPort()
      } catch (error) {
        this.uiManager.logError(
          `Port selection error: ${(error as Error).message}`
        )
      }
    })

    this.uiManager.on('connect', async () => {
      console.log('ModbusWebMonitor: received connect request')
      try {
        const config = this.uiManager.getSerialConfig()
        console.log('ModbusWebMonitor: serial config', config)
        await this.serialManager.connect(config)
      } catch (error) {
        const errorMessage = `Connection error: ${(error as Error).message}`
        console.error('ModbusWebMonitor:', errorMessage)
        this.uiManager.logError(errorMessage)
      }
    })

    this.uiManager.on('disconnect', async () => {
      try {
        await this.serialManager.disconnect()
      } catch (error) {
        this.uiManager.logError(
          `Disconnection error: ${(error as Error).message}`
        )
      }
    })

    this.uiManager.on('read', () => {
      const config = this.uiManager.getReadConfig()
      this.modbusClient.read(config)
    })

    this.uiManager.on('write', () => {
      const config = this.uiManager.getWriteConfig()
      this.modbusClient.write(config)
    })

    this.uiManager.on('monitorStart', () => {
      const config = this.uiManager.getReadConfig()
      this.modbusClient.startMonitoring(config)
    })

    this.uiManager.on('monitorStop', () => {
      this.modbusClient.stopMonitoring()
    })

    this.uiManager.on('protocolChange', (protocol) => {
      console.log('ModbusWebMonitor: protocol change', protocol)
      this.modbusClient.setProtocol(protocol)
    })
  }
}

// Application start
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded: starting ModbusWebMonitor')
  new ModbusWebMonitor()
})
