import type { SerialConfig } from './types.ts'

// SerialManager のイベント型
type SerialManagerEvents = {
  portSelected: [SerialPort]
  connected: []
  disconnected: []
  error: [Error]
  data: [Uint8Array]
}

// イベントエミッター基底クラス
export class EventEmitter<
  T extends Record<string, unknown[]> = Record<string, unknown[]>,
> {
  private listeners: { [K in keyof T]?: Array<(...args: T[K]) => void> } = {}

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    const eventListeners = this.listeners[event]
    if (eventListeners) {
      eventListeners.push(listener)
    }
  }

  emit<K extends keyof T>(event: K, ...args: T[K]) {
    const eventListeners = this.listeners[event]
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        listener(...args)
      })
    }
  }
}

// Web Serial API を使用したシリアル通信管理クラス
export class SerialManager extends EventEmitter<SerialManagerEvents> {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private isConnected = false

  async selectPort(): Promise<void> {
    console.log('SerialManager: ポート選択を開始')
    try {
      this.port = await navigator.serial.requestPort()
      console.log('SerialManager: ポートが選択されました', this.port)
      this.emit('portSelected', this.port)
    } catch (error) {
      console.error('SerialManager: ポート選択エラー', error)
      throw new Error(`ポート選択に失敗しました: ${(error as Error).message}`)
    }
  }

  async connect(config: SerialConfig): Promise<void> {
    console.log('SerialManager: 接続を開始', config)
    if (!this.port) {
      throw new Error('ポートが選択されていません')
    }

    if (this.isConnected) {
      throw new Error('既に接続されています')
    }

    try {
      await this.port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        flowControl: 'none',
        parity: config.parity,
        stopBits: config.stopBits,
      })

      console.log('SerialManager: ポートが開かれました')
      this.isConnected = true

      // リーダーとライターを設定
      if (this.port.readable) {
        this.reader = this.port.readable.getReader()
        this.startReading()
      }

      if (this.port.writable) {
        this.writer = this.port.writable.getWriter()
      }

      this.emit('connected')
    } catch (error) {
      this.isConnected = false
      throw new Error(`接続に失敗しました: ${(error as Error).message}`)
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return
    }

    try {
      // リーダーを解放
      if (this.reader) {
        await this.reader.cancel()
        this.reader.releaseLock()
        this.reader = null
      }

      // ライターを解放
      if (this.writer) {
        await this.writer.close()
        this.writer = null
      }

      // ポートを閉じる
      if (this.port) {
        await this.port.close()
      }

      this.isConnected = false
      this.emit('disconnected')
    } catch (error) {
      throw new Error(`切断に失敗しました: ${(error as Error).message}`)
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('シリアルポートが開かれていません')
    }

    try {
      await this.writer.write(data)
    } catch (error) {
      throw new Error(`データ送信に失敗しました: ${(error as Error).message}`)
    }
  }

  private async startReading(): Promise<void> {
    if (!this.reader) return

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read()

        if (done) {
          break
        }

        if (value) {
          this.emit('data', value)
        }
      }
    } catch (error) {
      if (this.isConnected) {
        this.emit(
          'error',
          new Error(`データ受信エラー: ${(error as Error).message}`)
        )
      }
    }
  }

  get connected(): boolean {
    return this.isConnected
  }
}
