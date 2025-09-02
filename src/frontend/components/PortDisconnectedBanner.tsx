import type { FunctionalComponent } from "preact";

interface Props {
  onReconnect: () => void;
}
export const PortDisconnectedBanner: FunctionalComponent<Props> = ({
  onReconnect,
}) => (
  <div className="port-disconnected-banner">
    <div className="banner-content">
      <span className="banner-icon">⚠️</span>
      <div className="banner-text">
        <strong>Port Disconnected</strong>
        <p>The serial port was disconnected unexpectedly. Possible causes:</p>
        <ul>
          <li>Cable or adapter unplugged</li>
          <li>Browser permission revoked</li>
          <li>Device error or power loss</li>
        </ul>
      </div>
      <button className="btn btn-warning" onClick={onReconnect} type="button">
        Reconnect
      </button>
    </div>
  </div>
);
