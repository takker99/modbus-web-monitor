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
    console.log('ModbusWebMonitor: 初期化開始')

    // Web Serial API のサポートチェック
    if (!('serial' in navigator)) {
      console.error('Web Serial APIがサポートされていません')
      alert(
        'このブラウザはWeb Serial APIをサポートしていません。Chrome 89以降をご利用ください。'
      )
      return
    }

    console.log('Web Serial APIがサポートされています')
    this.setupEventListeners()
    this.uiManager.updateConnectionStatus('未接続')
    console.log('ModbusWebMonitor: 初期化完了')
  }

  private setupEventListeners() {
    // シリアル接続関連のイベント
    this.serialManager.on('portSelected', () => {
      console.log(
        'ModbusWebMonitor: ポートが選択されました - 接続ボタンを有効化'
      )
      this.uiManager.enablePortSelection(true)
    })

    this.serialManager.on('connected', () => {
      this.uiManager.updateConnectionStatus('接続済み')
      this.uiManager.enableControls(true)
    })

    this.serialManager.on('disconnected', () => {
      this.uiManager.updateConnectionStatus('未接続')
      this.uiManager.enableControls(false)
      // ポートは選択済みなので接続ボタンは有効のまま
      this.uiManager.enablePortSelection(true)
    })

    this.serialManager.on('error', (error: Error) => {
      this.uiManager.logError(`シリアル通信エラー: ${error.message}`)
    })

    this.serialManager.on('data', (data: Uint8Array) => {
      this.modbusClient.handleResponse(data)
    })

    // Modbus通信関連のイベント
    this.modbusClient.on('response', (data) => {
      this.uiManager.displayData(data)
    })

    this.modbusClient.on('error', (error: Error) => {
      this.uiManager.logError(`Modbus通信エラー: ${error.message}`)
    })

    this.modbusClient.on('request', (data: Uint8Array) => {
      this.serialManager.send(data)
      this.uiManager.logCommunication('送信', data)
    })

    // UI関連のイベント
    this.uiManager.on('portSelect', async () => {
      try {
        await this.serialManager.selectPort()
      } catch (error) {
        this.uiManager.logError(`ポート選択エラー: ${(error as Error).message}`)
      }
    })

    this.uiManager.on('connect', async () => {
      console.log('ModbusWebMonitor: 接続要求を受信')
      try {
        const config = this.uiManager.getSerialConfig()
        console.log('ModbusWebMonitor: シリアル設定', config)
        await this.serialManager.connect(config)
      } catch (error) {
        const errorMessage = `接続エラー: ${(error as Error).message}`
        console.error('ModbusWebMonitor:', errorMessage)
        this.uiManager.logError(errorMessage)
      }
    })

    this.uiManager.on('disconnect', async () => {
      try {
        await this.serialManager.disconnect()
      } catch (error) {
        this.uiManager.logError(`切断エラー: ${(error as Error).message}`)
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
      console.log('ModbusWebMonitor: プロトコル変更', protocol)
      this.modbusClient.setProtocol(protocol)
    })
  }
}

// アプリケーション開始
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded: ModbusWebMonitorを開始')
  new ModbusWebMonitor()
})
