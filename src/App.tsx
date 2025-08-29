import { useCallback, useEffect, useState } from 'preact/hooks'
import { ModbusClient } from './modbus.ts'
import { SerialManager } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
  ReadFunctionCode,
  SerialConfig,
  WriteFunctionCode,
} from './types.ts'
import { isReadFunctionCode, isWriteFunctionCode } from './types.ts'

export function App() {
  // State management
  const [connectionStatus, setConnectionStatus] = useState<
    'Disconnected' | 'Connected'
  >('Disconnected')
  const [portSelected, setPortSelected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [logs, setLogs] = useState<
    Array<{ timestamp: string; type: string; message: string }>
  >([])
  const [data, setData] = useState<ModbusResponse[]>([])
  const [hexDisplay, setHexDisplay] = useState(false)

  // Serial configuration state
  const [serialConfig, setSerialConfig] = useState<SerialConfig>({
    baudRate: 38400,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
  })

  // Modbus configuration state
  const [slaveId, setSlaveId] = useState(1)
  const [protocol, setProtocol] = useState<'rtu' | 'ascii'>('rtu')
  const [readConfig, setReadConfig] = useState<
    Omit<ModbusReadConfig, 'slaveId'>
  >({
    functionCode: 3 as ReadFunctionCode,
    quantity: 10,
    startAddress: 0,
  })
  const [writeConfig, setWriteConfig] = useState({
    address: 0,
    functionCode: 6 as WriteFunctionCode,
    value: '',
  })

  // Instances (initialized via useEffect)
  const [serialManager] = useState(() => new SerialManager())
  const [modbusClient] = useState(() => new ModbusClient())

  // Memoized event handlers
  const handleBaudRateChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    setSerialConfig((prev: SerialConfig) => ({
      ...prev,
      baudRate: Number(target.value),
    }))
  }, [])

  const handleDataBitsChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    setSerialConfig((prev: SerialConfig) => ({
      ...prev,
      dataBits: Number(target.value) as 7 | 8,
    }))
  }, [])

  const handleParityChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    setSerialConfig((prev: SerialConfig) => ({
      ...prev,
      parity: target.value as 'none' | 'even' | 'odd',
    }))
  }, [])

  const handleStopBitsChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    setSerialConfig((prev: SerialConfig) => ({
      ...prev,
      stopBits: Number(target.value) as 1 | 2,
    }))
  }, [])

  const handleSlaveIdChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setSlaveId(Number(target.value))
  }, [])

  const handleProtocolSelectChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    handleProtocolChange(target.value as 'rtu' | 'ascii')
  }, [])

  const handleReadFunctionCodeChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    const value = Number(target.value)
    if (isReadFunctionCode(value)) {
      setReadConfig((prev) => ({
        ...prev,
        functionCode: value,
      }))
    } else {
      console.error('Invalid read function code:', value)
    }
  }, [])

  const handleStartAddressChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setReadConfig((prev) => ({
      ...prev,
      startAddress: Number(target.value),
    }))
  }, [])

  const handleQuantityChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setReadConfig((prev) => ({
      ...prev,
      quantity: Number(target.value),
    }))
  }, [])

  const handleWriteFunctionCodeChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLSelectElement
    const value = Number(target.value)
    if (isWriteFunctionCode(value)) {
      setWriteConfig((prev) => ({
        ...prev,
        functionCode: value,
      }))
    } else {
      console.error('Invalid write function code:', value)
    }
  }, [])

  const handleWriteAddressChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setWriteConfig((prev) => ({
      ...prev,
      address: Number(target.value),
    }))
  }, [])

  const handleWriteValueChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setWriteConfig((prev) => ({
      ...prev,
      value: target.value,
    }))
  }, [])

  const handleHexDisplayChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement
    setHexDisplay(target.checked)
  }, [])

  const handleCopyLogEntry = useCallback(
    (log: { timestamp: string; type: string; message: string }) => {
      copyLogEntry(log)
    },
    []
  )

  useEffect(() => {
    // Web Serial API support check
    if (!('serial' in navigator)) {
      addLog(
        'Error',
        'This browser does not support the Web Serial API. Please use Chrome 89+.'
      )
      return
    }

    // Event listeners setup
    const setupEventListeners = () => {
      // SerialManager events
      serialManager.on('portSelected', () => {
        console.log('Port selected')
        setPortSelected(true)
        addLog('Info', 'Serial port selected')
      })

      serialManager.on('connected', () => {
        console.log('Connected')
        setConnectionStatus('Connected')
        setIsConnected(true)
        addLog('Info', 'Connected to serial port')
      })

      serialManager.on('disconnected', () => {
        console.log('Disconnected')
        setConnectionStatus('Disconnected')
        setIsConnected(false)
        setIsMonitoring(false)
        addLog('Info', 'Disconnected from serial port')
      })

      serialManager.on('error', (error: Error) => {
        addLog('Error', `Serial communication error: ${error.message}`)
      })

      serialManager.on('data', (data: Uint8Array) => {
        modbusClient.handleResponse(data)
        addLog(
          'Received',
          Array.from(data)
            .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
            .join(' ')
        )
      })

      // ModbusClient events
      modbusClient.on('response', (response: ModbusResponse) => {
        setData((prev) => [...prev.slice(-99), response]) // 最新100件保持
        addLog(
          'Info',
          `Modbus response: received ${response.data.length} values`
        )
      })

      modbusClient.on('error', (error: Error) => {
        addLog('Error', `Modbus communication error: ${error.message}`)
      })

      modbusClient.on('request', (data: Uint8Array) => {
        serialManager.send(data)
        addLog(
          'Sent',
          Array.from(data)
            .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
            .join(' ')
        )
      })
    }

    setupEventListeners()
    modbusClient.setProtocol(protocol)

    return () => {
      // Cleanup
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
      addLog('Error', `Port selection error: ${(error as Error).message}`)
    }
  }

  const handleConnect = async () => {
    try {
      await serialManager.connect(serialConfig)
    } catch (error) {
      addLog('Error', `Connection error: ${(error as Error).message}`)
    }
  }

  const handleDisconnect = async () => {
    try {
      await serialManager.disconnect()
    } catch (error) {
      addLog('Error', `Disconnection error: ${(error as Error).message}`)
    }
  }

  const handleRead = async () => {
    try {
      const config: ModbusReadConfig = { ...readConfig, slaveId }
      await modbusClient.read(config)
    } catch (error) {
      addLog('Error', `Read error: ${(error as Error).message}`)
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
      addLog('Error', `Write error: ${(error as Error).message}`)
    }
  }

  const handleMonitorToggle = () => {
    if (isMonitoring) {
      modbusClient.stopMonitoring()
      setIsMonitoring(false)
      addLog('Info', 'Stopped monitoring')
    } else {
      const config: ModbusReadConfig = { ...readConfig, slaveId }
      modbusClient.startMonitoring(config, 1000)
      setIsMonitoring(true)
      addLog('Info', 'Started monitoring')
    }
  }

  const handleProtocolChange = (newProtocol: 'rtu' | 'ascii') => {
    setProtocol(newProtocol)
    modbusClient.setProtocol(newProtocol)
    addLog('Info', `Protocol changed to ${newProtocol.toUpperCase()}`)
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
      console.log('Copied log entry:', text)
    } catch (err) {
      console.error('Failed to copy log entry:', err)
    }
  }

  const copyAllLogs = async () => {
    try {
      const allLogsText = logs
        .map((log) => `${log.timestamp} [${log.type}] ${log.message}`)
        .join('\n')
      await navigator.clipboard.writeText(allLogsText)
      console.log('Copied all logs')
    } catch (err) {
      console.error('Failed to copy all logs:', err)
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
              connectionStatus === 'Connected'
                ? 'status-connected'
                : 'status-disconnected'
            }
          >
            {connectionStatus}
          </span>
        </div>
      </header>

      <main className="main-content">
        {/* Connection Settings Panel */}
        <section className="panel connection-panel">
          <h2>Connection Settings</h2>
          <div className="form-group">
            <div className="form-label">Serial Port:</div>
            <div className="port-controls">
              <button
                className="btn btn-primary"
                disabled={isConnected}
                onClick={handlePortSelect}
                type="button"
              >
                Select Port
              </button>
              <button
                className="btn btn-success"
                disabled={!portSelected || isConnected}
                onClick={handleConnect}
                type="button"
              >
                Connect
              </button>
              <button
                className="btn btn-danger"
                disabled={!isConnected}
                onClick={handleDisconnect}
                type="button"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="baudRate">Baud Rate:</label>
              <select
                disabled={isConnected}
                id="baudRate"
                onChange={handleBaudRateChange}
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
              <label htmlFor="dataBits">Data Bits:</label>
              <select
                disabled={isConnected}
                id="dataBits"
                onChange={handleDataBitsChange}
                value={serialConfig.dataBits}
              >
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="parity">Parity:</label>
              <select
                disabled={isConnected}
                id="parity"
                onChange={handleParityChange}
                value={serialConfig.parity}
              >
                <option value="none">None</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stopBits">Stop Bits:</label>
              <select
                disabled={isConnected}
                id="stopBits"
                onChange={handleStopBitsChange}
                value={serialConfig.stopBits}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="slaveId">Slave ID:</label>
              <input
                disabled={isConnected}
                id="slaveId"
                max="247"
                min="1"
                onChange={handleSlaveIdChange}
                type="number"
                value={slaveId}
              />
            </div>

            <div className="form-group">
              <label htmlFor="protocol">Protocol:</label>
              <select
                disabled={isConnected}
                id="protocol"
                onChange={handleProtocolSelectChange}
                value={protocol}
              >
                <option value="rtu">Modbus RTU</option>
                <option value="ascii">Modbus ASCII</option>
              </select>
            </div>
          </div>
        </section>

        {/* Read Settings Panel */}
        <section className="panel read-panel">
          <h2>Read Data</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="readFunctionCode">Function Code:</label>
              <select
                disabled={!isConnected}
                id="readFunctionCode"
                onChange={handleReadFunctionCodeChange}
                value={readConfig.functionCode}
              >
                <option value={1}>01 - Read Coils</option>
                <option value={2}>02 - Read Discrete Inputs</option>
                <option value={3}>03 - Read Holding Registers</option>
                <option value={4}>04 - Read Input Registers</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="startAddress">Start Address:</label>
              <input
                disabled={!isConnected}
                id="startAddress"
                max="65535"
                min="0"
                onChange={handleStartAddressChange}
                type="number"
                value={readConfig.startAddress}
              />
            </div>

            <div className="form-group">
              <label htmlFor="quantity">Quantity:</label>
              <input
                disabled={!isConnected}
                id="quantity"
                max="125"
                min="1"
                onChange={handleQuantityChange}
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
                Read Once
              </button>
              <button
                className="btn btn-secondary"
                disabled={!isConnected}
                onClick={handleMonitorToggle}
                type="button"
              >
                {isMonitoring ? 'Stop Monitor' : 'Start Monitor'}
              </button>
            </div>
          </div>
        </section>

        {/* Write Settings Panel */}
        <section className="panel write-panel">
          <h2>Write Data</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="writeFunctionCode">Function Code:</label>
              <select
                disabled={!isConnected}
                id="writeFunctionCode"
                onChange={handleWriteFunctionCodeChange}
                value={writeConfig.functionCode}
              >
                <option value={5}>05 - Write Single Coil</option>
                <option value={6}>06 - Write Single Register</option>
                <option value={15}>15 - Write Multiple Coils</option>
                <option value={16}>16 - Write Multiple Registers</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="writeAddress">Write Address:</label>
              <input
                disabled={!isConnected}
                id="writeAddress"
                max="65535"
                min="0"
                onChange={handleWriteAddressChange}
                type="number"
                value={writeConfig.address}
              />
            </div>

            <div className="form-group">
              <label htmlFor="writeValue">Value:</label>
              <input
                disabled={!isConnected}
                id="writeValue"
                onChange={handleWriteValueChange}
                placeholder="e.g. 1234 or 0x04D2"
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
                Write
              </button>
            </div>
          </div>
        </section>

        {/* Data Display Panel */}
        <section className="panel data-panel">
          <h2>Data Display</h2>
          <div className="data-controls">
            <label>
              <input
                checked={hexDisplay}
                onChange={handleHexDisplayChange}
                type="checkbox"
              />{' '}
              Hex Display
            </label>
            <button
              className="btn btn-secondary"
              onClick={clearLogs}
              type="button"
            >
              Clear Logs
            </button>
            <button
              className="btn btn-secondary"
              onClick={copyAllLogs}
              type="button"
            >
              Copy All Logs
            </button>
          </div>

          <div className="data-display">
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Value</th>
                    <th>Time</th>
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
              <h3>Communication Log</h3>
              <div className="log-display">
                {logs.map((log, index) => (
                  <div
                    className={`log-entry log-${log.type === 'Error' ? 'error' : log.type === 'Sent' ? 'sent' : log.type === 'Received' ? 'received' : 'info'}`}
                    key={`log-${log.timestamp}-${index}`}
                  >
                    <span className="log-timestamp">{log.timestamp}</span>
                    <span className="log-direction">[{log.type}]</span>
                    <span className="log-data">{log.message}</span>
                    <button
                      className="log-copy-btn"
                      onClick={() => handleCopyLogEntry(log)}
                      title="Copy this log"
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
