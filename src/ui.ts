import { EventEmitter } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
  SerialConfig,
} from './types.ts'

// UIManagerのイベント型
type UIManagerEvents = {
  portSelect: []
  connect: []
  disconnect: []
  read: [ModbusReadConfig]
  write: [ModbusWriteConfig]
  monitorStart: [ModbusReadConfig]
  monitorStop: []
  protocolChange: ['rtu' | 'ascii']
  clearLogs: []
}

export class UIManager extends EventEmitter<UIManagerEvents> {
  private elements: { [key: string]: HTMLElement } = {}
  private isMonitoring = false

  constructor() {
    super()
    this.initializeElements()
    this.setupEventListeners()
    this.initializeButtonStates()
  }

  private initializeButtonStates() {
    console.log('UIManager: ボタンの初期状態を設定')
    // 初期状態では接続ボタンを無効化
    if (this.elements['connect-btn']) {
      ;(this.elements['connect-btn'] as HTMLButtonElement).disabled = true
    }
    if (this.elements['disconnect-btn']) {
      ;(this.elements['disconnect-btn'] as HTMLButtonElement).disabled = true
    }
    // その他のコントロールも無効化
    this.enableControls(false)
  }

  private initializeElements() {
    const elementIds = [
      'connection-status',
      'port-select',
      'connect-btn',
      'disconnect-btn',
      'baud-rate',
      'data-bits',
      'parity',
      'stop-bits',
      'slave-id',
      'protocol',
      'function-code',
      'start-address',
      'quantity',
      'read-btn',
      'monitor-btn',
      'write-function',
      'write-address',
      'write-value',
      'write-btn',
      'hex-display',
      'auto-scroll',
      'clear-log',
      'data-tbody',
      'communication-log',
    ]

    console.log('UIManager: 要素の初期化開始')
    for (const id of elementIds) {
      const element = document.getElementById(id)
      if (element) {
        this.elements[id] = element
        console.log(`UIManager: 要素 '${id}' が見つかりました`)
      } else {
        console.warn(`UIManager: 要素 '${id}' が見つかりません`)
      }
    }
    console.log('UIManager: 要素の初期化完了')
  }

  private setupEventListeners() {
    console.log('UIManager: イベントリスナーの設定開始')

    // ポート選択
    this.elements['port-select']?.addEventListener('click', () => {
      console.log('UIManager: ポート選択ボタンがクリックされました')
      this.emit('portSelect')
    })

    // 接続・切断
    this.elements['connect-btn']?.addEventListener('click', () => {
      console.log('UIManager: 接続ボタンがクリックされました')
      this.emit('connect')
    })

    this.elements['disconnect-btn']?.addEventListener('click', () => {
      console.log('UIManager: 切断ボタンがクリックされました')
      this.emit('disconnect')
    })

    // データ読み取り
    this.elements['read-btn']?.addEventListener('click', () => {
      const readConfig = this.getReadConfig()
      this.emit('read', readConfig)
    })

    // 監視開始/停止
    this.elements['monitor-btn']?.addEventListener('click', () => {
      if (this.isMonitoring) {
        this.emit('monitorStop')
        this.isMonitoring = false
        ;(this.elements['monitor-btn'] as HTMLButtonElement).textContent =
          '監視開始'
      } else {
        const readConfig = this.getReadConfig()
        this.emit('monitorStart', readConfig)
        this.isMonitoring = true
        ;(this.elements['monitor-btn'] as HTMLButtonElement).textContent =
          '監視停止'
      }
    })

    // データ書き込み
    this.elements['write-btn']?.addEventListener('click', () => {
      const writeConfig = this.getWriteConfig()
      this.emit('write', writeConfig)
    })

    // ログクリア
    this.elements['clear-log']?.addEventListener('click', () => {
      this.clearLog()
    })

    // プロトコル変更
    const protocolElement = this.elements['protocol']
    protocolElement?.addEventListener('change', () => {
      const protocol = (protocolElement as HTMLSelectElement).value as
        | 'rtu'
        | 'ascii'
      this.emit('protocolChange', protocol)
    })
  }

  updateConnectionStatus(status: string) {
    if (this.elements['connection-status']) {
      this.elements['connection-status'].textContent = status
      this.elements['connection-status'].className =
        status === '接続済み' ? 'status-connected' : 'status-disconnected'
    }
  }

  enableControls(enabled: boolean) {
    const controlIds = ['read-btn', 'monitor-btn', 'write-btn']
    controlIds.forEach((id) => {
      const element = this.elements[id] as HTMLButtonElement
      if (element) {
        element.disabled = !enabled
      }
    })

    // 接続・切断ボタンの状態切り替え（接続時）
    if (enabled) {
      // 接続済みの場合：接続ボタン無効、切断ボタン有効
      if (this.elements['connect-btn']) {
        ;(this.elements['connect-btn'] as HTMLButtonElement).disabled = true
      }
      if (this.elements['disconnect-btn']) {
        ;(this.elements['disconnect-btn'] as HTMLButtonElement).disabled = false
      }
    } else {
      // 切断時の状態はenablePortSelectionで管理
    }
  }

  enablePortSelection(portSelected: boolean) {
    console.log('UIManager: ポート選択状態を更新', portSelected)
    // ポート選択後は接続ボタンを有効化
    if (this.elements['connect-btn']) {
      ;(this.elements['connect-btn'] as HTMLButtonElement).disabled =
        !portSelected
    }
    // 切断ボタンは無効のまま（接続後に有効化される）
    if (this.elements['disconnect-btn']) {
      ;(this.elements['disconnect-btn'] as HTMLButtonElement).disabled = true
    }
  }

  getSerialConfig(): SerialConfig {
    return {
      baudRate: Number.parseInt(
        (this.elements['baud-rate'] as HTMLSelectElement).value,
        10
      ),
      dataBits: Number.parseInt(
        (this.elements['data-bits'] as HTMLSelectElement).value,
        10
      ) as 7 | 8,
      parity: (this.elements['parity'] as HTMLSelectElement).value as
        | 'none'
        | 'even'
        | 'odd',
      stopBits: Number.parseInt(
        (this.elements['stop-bits'] as HTMLSelectElement).value,
        10
      ) as 1 | 2,
    }
  }

  getReadConfig(): ModbusReadConfig {
    return {
      functionCode: Number.parseInt(
        (this.elements['function-code'] as HTMLSelectElement).value,
        10
      ),
      quantity: Number.parseInt(
        (this.elements['quantity'] as HTMLInputElement).value,
        10
      ),
      slaveId: Number.parseInt(
        (this.elements['slave-id'] as HTMLInputElement).value,
        10
      ),
      startAddress: Number.parseInt(
        (this.elements['start-address'] as HTMLInputElement).value,
        10
      ),
    }
  }

  getWriteConfig(): ModbusWriteConfig {
    const valueText = (this.elements['write-value'] as HTMLInputElement).value
    let value: number

    // 16進数チェック
    if (valueText.startsWith('0x') || valueText.startsWith('0X')) {
      value = Number.parseInt(valueText, 16)
    } else {
      value = Number.parseInt(valueText, 10)
    }

    return {
      address: Number.parseInt(
        (this.elements['write-address'] as HTMLInputElement).value,
        10
      ),
      functionCode: Number.parseInt(
        (this.elements['write-function'] as HTMLSelectElement).value,
        10
      ),
      slaveId: Number.parseInt(
        (this.elements['slave-id'] as HTMLInputElement).value,
        10
      ),
      value,
    }
  }

  displayData(response: ModbusResponse) {
    const tbody = this.elements['data-tbody'] as HTMLTableSectionElement
    if (!tbody) return

    const isHex = (this.elements['hex-display'] as HTMLInputElement).checked
    const startAddress = Number.parseInt(
      (this.elements['start-address'] as HTMLInputElement).value,
      10
    )

    // テーブルを一度クリアして新しいデータを表示（監視モード時）
    if (this.isMonitoring) {
      tbody.innerHTML = ''
    }

    response.data.forEach((value: number, index: number) => {
      const row = tbody.insertRow()
      const addressCell = row.insertCell(0)
      const valueCell = row.insertCell(1)
      const timeCell = row.insertCell(2)

      const address = startAddress + index
      addressCell.textContent = isHex
        ? `0x${address.toString(16).toUpperCase().padStart(4, '0')}`
        : address.toString()
      valueCell.textContent = isHex
        ? `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
        : value.toString()
      timeCell.textContent = response.timestamp.toLocaleTimeString()
    })

    // 自動スクロール
    if ((this.elements['auto-scroll'] as HTMLInputElement).checked) {
      tbody.scrollTop = tbody.scrollHeight
    }
  }

  logCommunication(direction: '送信' | '受信', data: Uint8Array) {
    const logElement = this.elements['communication-log']
    if (!logElement) return

    const timestamp = new Date().toLocaleTimeString()
    const hexData = Array.from(data)
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')

    const logEntry = document.createElement('div')
    logEntry.className = `log-entry log-${direction === '送信' ? 'tx' : 'rx'}`
    logEntry.innerHTML = `
      <span class="log-time">${timestamp}</span>
      <span class="log-direction">[${direction}]</span>
      <span class="log-data">${hexData}</span>
    `

    logElement.appendChild(logEntry)

    // 自動スクロール
    if ((this.elements['auto-scroll'] as HTMLInputElement).checked) {
      logElement.scrollTop = logElement.scrollHeight
    }

    // ログエントリ数制限（パフォーマンス対策）
    const maxEntries = 1000
    if (logElement.children.length > maxEntries) {
      logElement.removeChild(logElement.firstChild as Node)
    }
  }

  logError(message: string) {
    const logElement = this.elements['communication-log']
    if (!logElement) return

    const timestamp = new Date().toLocaleTimeString()
    const logEntry = document.createElement('div')
    logEntry.className = 'log-entry log-error'
    logEntry.innerHTML = `
      <span class="log-time">${timestamp}</span>
      <span class="log-direction">[エラー]</span>
      <span class="log-data">${message}</span>
    `

    logElement.appendChild(logEntry)

    // 自動スクロール
    if ((this.elements['auto-scroll'] as HTMLInputElement).checked) {
      logElement.scrollTop = logElement.scrollHeight
    }
  }

  private clearLog() {
    const logElement = this.elements['communication-log']
    const tbody = this.elements['data-tbody'] as HTMLTableSectionElement

    if (logElement) {
      logElement.innerHTML = ''
    }
    if (tbody) {
      tbody.innerHTML = ''
    }
  }
}
