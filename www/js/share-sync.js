const request = require('request-promise');
const md5 = require('md5');

const { store } = require('electron').remote.require('./app');

const SYNC_API_URL = 'https://api.sikhitothemax.org';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

function onConnect(code, syncType) {
  if (!window.socket) {
    window.socket = {
      sync: '...',
      admin: '...',
    };
  }

  window.socket[syncType] = window.io(`${SYNC_API_URL}/${code}`);
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

    if (window.codes && (window.codes.sync || window.codes.admin)) {
      return window.codes;
    }

    try {
      const result = await request(`${SYNC_API_URL}/sync/begin/${host}`);
      const codes = {
        sync: JSON.parse(result).data.namespaceString,
        admin: generateCode(6),
      };

      if (window.io !== undefined) {
        window.codes = codes;
        onConnect(codes.sync, 'sync');
        onConnect(codes.admin, 'admin');
      } else {
        // TODO: Wait for io or something
      }
      store.set('sync.codes', codes);
      store.set('sync.token', md5(codes.admin));
      return codes;
    } catch (e) {
      return false;
    }
  },
  addEvent(event, data, syncType = 'sync') {
    if (window.socket) {
      window.socket[syncType].emit(event, data);
    }
  },
  addListener(event, cb, syncType = 'sync') {
    if (window.socket) {
      window.socket[syncType].on(event, cb);
    }
  },
  async onEnd(code, syncType) {
    await request(`${SYNC_API_URL}/sync/end/${code}`);
    window.socket[syncType].disconnect();
    window.socket[syncType] = undefined;
    window.codes[syncType] = undefined;
    store.set(`sync.codes.${syncType}`, '...');
  },
};
