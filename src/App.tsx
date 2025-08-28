import { useEffect, useState } from 'preact/hooks'
import { ModbusClient } from './modbus.ts'
import { SerialManager } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
  SerialConfig,
} from './types.ts'

export function App() {
  // 状態管理
  const [connectionStatus, setConnectionStatus] = useState<
    '未接続' | '接続済み'
  >('未接続')
  const [portSelected, setPortSelected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [logs, setLogs] = useState<
    Array<{ timestamp: string; type: string; message: string }>
  >([])
  const [data, setData] = useState<ModbusResponse[]>([])
  const [hexDisplay, setHexDisplay] = useState(false)

  // シリアル設定の状態
  const [serialConfig, setSerialConfig] = useState<SerialConfig>({
    baudRate: 38400,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
  })

  // Modbus設定の状態
  const [slaveId, setSlaveId] = useState(1)
  const [protocol, setProtocol] = useState<'rtu' | 'ascii'>('rtu')
  const [readConfig, setReadConfig] = useState<
    Omit<ModbusReadConfig, 'slaveId'>
  >({
    functionCode: 3,
    quantity: 10,
    startAddress: 0,
  })
  const [writeConfig, setWriteConfig] = useState({
    address: 0,
    functionCode: 6,
    value: '',
  })

  // インスタンス（useEffectで初期化）
  const [serialManager] = useState(() => new SerialManager())
  const [modbusClient] = useState(() => new ModbusClient())

  useEffect(() => {
    // Web Serial API サポートチェック
    if (!('serial' in navigator)) {
      addLog(
        'エラー',
        'このブラウザはWeb Serial APIをサポートしていません。Chrome 89以降をご利用ください。'
      )
      return
    }

    // イベントリスナー設定
    const setupEventListeners = () => {
      // SerialManager イベント
      serialManager.on('portSelected', () => {
        console.log('Port selected')
        setPortSelected(true)
        addLog('情報', 'ポートが選択されました')
      })

      serialManager.on('connected', () => {
        console.log('Connected')
        setConnectionStatus('接続済み')
        setIsConnected(true)
        addLog('情報', 'シリアルポートに接続しました')
      })

      serialManager.on('disconnected', () => {
        console.log('Disconnected')
        setConnectionStatus('未接続')
        setIsConnected(false)
        setIsMonitoring(false)
        addLog('情報', 'シリアルポートから切断しました')
      })

      serialManager.on('error', (error: Error) => {
        addLog('エラー', `シリアル通信エラー: ${error.message}`)
      })

      serialManager.on('data', (data: Uint8Array) => {
        modbusClient.handleResponse(data)
        addLog(
          '受信',
          Array.from(data)
            .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
            .join(' ')
        )
      })

      // ModbusClient イベント
      modbusClient.on('response', (response: ModbusResponse) => {
        setData((prev) => [...prev.slice(-99), response]) // 最新100件保持
        addLog('情報', `Modbus応答: ${response.data.length}個のデータを受信`)
      })

      modbusClient.on('error', (error: Error) => {
        addLog('エラー', `Modbus通信エラー: ${error.message}`)
      })

      modbusClient.on('request', (data: Uint8Array) => {
        serialManager.send(data)
        addLog(
          '送信',
          Array.from(data)
            .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
            .join(' ')
        )
      })
    }

    setupEventListeners()
    modbusClient.setProtocol(protocol)

    return () => {
      // クリーンアップ
      serialManager.disconnect()
      modbusClient.stopMonitoring()
    }
  }, [serialManager, modbusClient, protocol])

  const addLog = (type: string, message: string) => {
    const time = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev.slice(-99), { message, timestamp: time, type }]) // 最新100件保持
  }

  const handlePortSelect = async () => {
    try {
      await serialManager.selectPort()
    } catch (error) {
      addLog('エラー', `ポート選択エラー: ${(error as Error).message}`)
    }
  }

  const handleConnect = async () => {
    try {
      await serialManager.connect(serialConfig)
    } catch (error) {
      addLog('エラー', `接続エラー: ${(error as Error).message}`)
    }
  }

  const handleDisconnect = async () => {
    try {
      await serialManager.disconnect()
    } catch (error) {
      addLog('エラー', `切断エラー: ${(error as Error).message}`)
    }
  }

  const handleRead = async () => {
    try {
      const config: ModbusReadConfig = { ...readConfig, slaveId }
      await modbusClient.read(config)
    } catch (error) {
      addLog('エラー', `読み取りエラー: ${(error as Error).message}`)
    }
  }

  const handleWrite = async () => {
    try {
      let value: number
      if (hexDisplay) {
        value = Number.parseInt(writeConfig.value, 16)
      } else {
        value = Number.parseInt(writeConfig.value, 10)
      }

      const config: ModbusWriteConfig = {
        address: writeConfig.address,
        functionCode: writeConfig.functionCode,
        slaveId,
        value,
      }

      await modbusClient.write(config)
    } catch (error) {
      addLog('エラー', `書き込みエラー: ${(error as Error).message}`)
    }
  }

  const handleMonitorToggle = () => {
    if (isMonitoring) {
      modbusClient.stopMonitoring()
      setIsMonitoring(false)
      addLog('情報', '監視を停止しました')
    } else {
      const config: ModbusReadConfig = { ...readConfig, slaveId }
      modbusClient.startMonitoring(config, 1000)
      setIsMonitoring(true)
      addLog('情報', '監視を開始しました')
    }
  }

  const handleProtocolChange = (newProtocol: 'rtu' | 'ascii') => {
    setProtocol(newProtocol)
    modbusClient.setProtocol(newProtocol)
    addLog('情報', `プロトコルを${newProtocol.toUpperCase()}に変更しました`)
  }

  const clearLogs = () => {
    setLogs([])
    setData([])
  }

  const copyLogEntry = async (log: {
    timestamp: string
    type: string
    message: string
  }) => {
    try {
      const text = `${log.timestamp} [${log.type}] ${log.message}`
      await navigator.clipboard.writeText(text)
      console.log('ログをコピーしました:', text)
    } catch (err) {
      console.error('ログのコピーに失敗しました:', err)
    }
  }

  const copyAllLogs = async () => {
    try {
      const allLogsText = logs
        .map((log) => `${log.timestamp} [${log.type}] ${log.message}`)
        .join('\n')
      await navigator.clipboard.writeText(allLogsText)
      console.log('全ログをコピーしました')
    } catch (err) {
      console.error('全ログのコピーに失敗しました:', err)
    }
  }

  const formatValue = (value: number) => {
    return hexDisplay
      ? `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
      : value.toString()
  }

  const formatAddress = (address: number) => {
    return hexDisplay
      ? `0x${address.toString(16).toUpperCase().padStart(4, '0')}`
      : address.toString()
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Modbus Web Monitor</h1>
        <div className="connection-status">
          <span
            className={
              connectionStatus === '接続済み'
                ? 'status-connected'
                : 'status-disconnected'
            }
          >
            {connectionStatus}
          </span>
        </div>
      </header>

      <main className="main-content">
        {/* 接続設定パネル */}
        <section className="panel connection-panel">
          <h2>接続設定</h2>
          <div className="form-group">
            <div className="form-label">シリアルポート:</div>
            <div className="port-controls">
              <button
                className="btn btn-primary"
                disabled={isConnected}
                onClick={handlePortSelect}
                type="button"
              >
                ポートを選択
              </button>
              <button
                className="btn btn-success"
                disabled={!portSelected || isConnected}
                onClick={handleConnect}
                type="button"
              >
                接続
              </button>
              <button
                className="btn btn-danger"
                disabled={!isConnected}
                onClick={handleDisconnect}
                type="button"
              >
                切断
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="baudRate">ボーレート:</label>
              <select
                disabled={isConnected}
                id="baudRate"
                onChange={(e) =>
                  setSerialConfig((prev: SerialConfig) => ({
                    ...prev,
                    baudRate: Number(e.currentTarget.value),
                  }))
                }
                value={serialConfig.baudRate}
              >
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dataBits">データビット:</label>
              <select
                disabled={isConnected}
                id="dataBits"
                onChange={(e) =>
                  setSerialConfig((prev: SerialConfig) => ({
                    ...prev,
                    dataBits: Number(e.currentTarget.value) as 7 | 8,
                  }))
                }
                value={serialConfig.dataBits}
              >
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="parity">パリティ:</label>
              <select
                disabled={isConnected}
                id="parity"
                onChange={(e) =>
                  setSerialConfig((prev: SerialConfig) => ({
                    ...prev,
                    parity: e.currentTarget.value as 'none' | 'even' | 'odd',
                  }))
                }
                value={serialConfig.parity}
              >
                <option value="none">なし</option>
                <option value="even">偶数</option>
                <option value="odd">奇数</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stopBits">ストップビット:</label>
              <select
                disabled={isConnected}
                id="stopBits"
                onChange={(e) =>
                  setSerialConfig((prev: SerialConfig) => ({
                    ...prev,
                    stopBits: Number(e.currentTarget.value) as 1 | 2,
                  }))
                }
                value={serialConfig.stopBits}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="slaveId">スレーブID:</label>
              <input
                disabled={isConnected}
                id="slaveId"
                max="247"
                min="1"
                onChange={(e) => setSlaveId(Number(e.currentTarget.value))}
                type="number"
                value={slaveId}
              />
            </div>

            <div className="form-group">
              <label htmlFor="protocol">プロトコル:</label>
              <select
                disabled={isConnected}
                id="protocol"
                onChange={(e) =>
                  handleProtocolChange(e.currentTarget.value as 'rtu' | 'ascii')
                }
                value={protocol}
              >
                <option value="rtu">Modbus RTU</option>
                <option value="ascii">Modbus ASCII</option>
              </select>
            </div>
          </div>
        </section>

        {/* 読み取り設定パネル */}
        <section className="panel read-panel">
          <h2>データ読み取り</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="readFunctionCode">ファンクションコード:</label>
              <select
                disabled={!isConnected}
                id="readFunctionCode"
                onChange={(e) =>
                  setReadConfig((prev) => ({
                    ...prev,
                    functionCode: Number(e.currentTarget.value),
                  }))
                }
                value={readConfig.functionCode}
              >
                <option value={1}>01 - コイル読み取り</option>
                <option value={2}>02 - 入力ステータス読み取り</option>
                <option value={3}>03 - ホールディングレジスタ読み取り</option>
                <option value={4}>04 - 入力レジスタ読み取り</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="startAddress">開始アドレス:</label>
              <input
                disabled={!isConnected}
                id="startAddress"
                max="65535"
                min="0"
                onChange={(e) =>
                  setReadConfig((prev) => ({
                    ...prev,
                    startAddress: Number(e.currentTarget.value),
                  }))
                }
                type="number"
                value={readConfig.startAddress}
              />
            </div>

            <div className="form-group">
              <label htmlFor="quantity">読み取り数:</label>
              <input
                disabled={!isConnected}
                id="quantity"
                max="125"
                min="1"
                onChange={(e) =>
                  setReadConfig((prev) => ({
                    ...prev,
                    quantity: Number(e.currentTarget.value),
                  }))
                }
                type="number"
                value={readConfig.quantity}
              />
            </div>

            <div className="form-group">
              <button
                className="btn btn-primary"
                disabled={!isConnected || isMonitoring}
                onClick={handleRead}
                type="button"
              >
                読み取り実行
              </button>
              <button
                className="btn btn-secondary"
                disabled={!isConnected}
                onClick={handleMonitorToggle}
                type="button"
              >
                {isMonitoring ? '監視停止' : '監視開始'}
              </button>
            </div>
          </div>
        </section>

        {/* 書き込み設定パネル */}
        <section className="panel write-panel">
          <h2>データ書き込み</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="writeFunctionCode">ファンクションコード:</label>
              <select
                disabled={!isConnected}
                id="writeFunctionCode"
                onChange={(e) =>
                  setWriteConfig((prev) => ({
                    ...prev,
                    functionCode: Number(e.currentTarget.value),
                  }))
                }
                value={writeConfig.functionCode}
              >
                <option value={5}>05 - 単一コイル書き込み</option>
                <option value={6}>06 - 単一レジスタ書き込み</option>
                <option value={15}>15 - 複数コイル書き込み</option>
                <option value={16}>16 - 複数レジスタ書き込み</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="writeAddress">書き込みアドレス:</label>
              <input
                disabled={!isConnected}
                id="writeAddress"
                max="65535"
                min="0"
                onChange={(e) =>
                  setWriteConfig((prev) => ({
                    ...prev,
                    address: Number(e.currentTarget.value),
                  }))
                }
                type="number"
                value={writeConfig.address}
              />
            </div>

            <div className="form-group">
              <label htmlFor="writeValue">書き込み値:</label>
              <input
                disabled={!isConnected}
                id="writeValue"
                onChange={(e) =>
                  setWriteConfig((prev) => ({
                    ...prev,
                    value: e.currentTarget.value,
                  }))
                }
                placeholder="例: 1234 または 0x04D2"
                type="text"
                value={writeConfig.value}
              />
            </div>

            <div className="form-group">
              <button
                className="btn btn-warning"
                disabled={!isConnected || !writeConfig.value}
                onClick={handleWrite}
                type="button"
              >
                書き込み実行
              </button>
            </div>
          </div>
        </section>

        {/* データ表示パネル */}
        <section className="panel data-panel">
          <h2>データ表示</h2>
          <div className="data-controls">
            <label>
              <input
                checked={hexDisplay}
                onChange={(e) => setHexDisplay(e.currentTarget.checked)}
                type="checkbox"
              />{' '}
              16進数表示
            </label>
            <button
              className="btn btn-secondary"
              onClick={clearLogs}
              type="button"
            >
              ログクリア
            </button>
            <button
              className="btn btn-secondary"
              onClick={copyAllLogs}
              type="button"
            >
              全ログコピー
            </button>
          </div>

          <div className="data-display">
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>アドレス</th>
                    <th>値</th>
                    <th>時刻</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flatMap((response) =>
                    response.data.map((value: number, dataIndex: number) => (
                      <tr
                        key={`resp-${response.timestamp.getTime()}-addr-${(readConfig.startAddress || 0) + dataIndex}-val-${value}`}
                      >
                        <td>
                          {formatAddress(
                            (readConfig.startAddress || 0) + dataIndex
                          )}
                        </td>
                        <td>{formatValue(value)}</td>
                        <td>{response.timestamp.toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="log-container">
              <h3>通信ログ</h3>
              <div className="log-display">
                {logs.map((log, index) => (
                  <div
                    className={`log-entry log-${log.type === 'エラー' ? 'error' : log.type === '送信' ? 'sent' : log.type === '受信' ? 'received' : 'info'}`}
                    key={`log-${log.timestamp}-${index}`}
                  >
                    <span className="log-timestamp">{log.timestamp}</span>
                    <span className="log-direction">[{log.type}]</span>
                    <span className="log-data">{log.message}</span>
                    <button
                      className="log-copy-btn"
                      onClick={() => copyLogEntry(log)}
                      title="このログをコピー"
                      type="button"
                    >
                      📋
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
