import React from 'react';

const os = require('os');
const path = require('path');
const fs = require('fs');

// Where crashes get persisted so we can read the stack even after a white-screen.
const LOG_PATH = path.join(os.tmpdir(), 'sttm-voicefollow-errors.log');

// Reading .stack/.message off a revoked Proxy (immer/Realm) throws again, so
// pull error text defensively — that is often the crash itself.
const safeText = (err) => {
  try {
    if (err && err.stack) return err.stack;
  } catch (_) {
    /* revoked proxy */
  }
  try {
    if (err && err.message) return err.message;
  } catch (_) {
    /* revoked proxy */
  }
  try {
    return String(err);
  } catch (_) {
    return '<unstringifiable error (revoked proxy?)>';
  }
};

const persist = (label, err, extra) => {
  const stamp = new Date().toISOString();
  const stack = safeText(err);
  const line = `\n==== ${stamp} [${label}] ====\n${stack}\n${extra || ''}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {
    /* best-effort */
  }
  // eslint-disable-next-line no-console
  console.error(`[sttm ${label}]`, err, extra || '');
};

// Install once per renderer: catch async/callback errors that never reach React.
let globalsInstalled = false;
const installGlobalHandlers = () => {
  if (globalsInstalled || typeof window === 'undefined') return;
  globalsInstalled = true;
  window.addEventListener('error', (e) => persist('window.onerror', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) =>
    persist('unhandledrejection', e.reason || e),
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    installGlobalHandlers();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    persist(this.props.label || 'render', error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            overflow: 'auto',
            padding: 24,
            background: '#1b0f0f',
            color: '#ffd7d7',
            font: '12px/1.5 monospace',
          }}
        >
          <h2 style={{ color: '#ff6b6b', marginTop: 0 }}>
            Render error{this.props.label ? ` in ${this.props.label}` : ''}
          </h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{safeText(error)}</pre>
          <p style={{ opacity: 0.7 }}>Also logged to {LOG_PATH}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
