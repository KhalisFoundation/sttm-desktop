const request = require('request-promise');
const { store } = require('electron').remote.require('./app');

const SYNC_API_URL = 'https://api.sikhitothemax.org';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

function onConnect(syncCode) {
  window.socket = window.io(`${SYNC_API_URL}/${syncCode}`);
}

function generateCode(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < len; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === len / 2 - 1) {
      code += '-';
    }
  }
  return code;
}

module.exports = {
  init() {
    // Inject socket.io script
    if (document.querySelector(`script[src="${SOCKET_SCRIPT_SOURCE}"]`) === null) {
      const script = document.createElement('script');
      script.src = SOCKET_SCRIPT_SOURCE;
      document.body.appendChild(script);
    }
  },
  async tryConnection() {
    const host = store.get('userId');

    if (window.namespaceString) {
      return window.namespaceString;
    }
    try {
      const result = await request(`${SYNC_API_URL}/sync/begin/${host}`);
      const codes = {
        sync: JSON.parse(result).data.namespaceString,
        admin: generateCode(6),
      };

      if (window.io !== undefined) {
        window.codes = codes;
        onConnect(codes.syncCode);
      } else {
        // TODO: Wait for io or something
      }
      return codes;
    } catch (e) {
      return false;
    }
  },
  addEvent(event, data) {
    if (window.socket) {
      window.socket.emit(event, data);
    }
  },
  addListener(event, cb) {
    if (window.socket) {
      window.socket.on(event, cb);
    }
  },
  async onEnd(namespaceString) {
    await request(`${SYNC_API_URL}/sync/end/${namespaceString}`);
    window.socket.disconnect();
    window.socket = undefined;
    window.namespaceString = undefined;
  },
};
