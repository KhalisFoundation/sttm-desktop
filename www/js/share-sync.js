const request = require('request-promise');
// const md5 = require('md5'); To be used when web is ready

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
  async tryConnection(syncType) {
    const host = store.get('userId');

    if (!window.codes) {
      // initialize empty codes object on first start
      window.codes = {
        sync: undefined,
        admin: undefined,
      };
      store.set('sync.codes', window.codes);
    } else if (window.codes[syncType]) {
      return window.codes[syncType];
    }

    try {
      const result = await request(`${SYNC_API_URL}/sync/begin/${host}`);

      const code = syncType === 'sync' ? JSON.parse(result).data.namespaceString : generateCode(6);

      if (window.io !== undefined) {
        window.codes[syncType] = code;
        onConnect(window.codes[syncType], syncType);
      } else {
        // TODO: Wait for io or something
      }
      store.set(`sync.codes.${syncType}`, code);
      return code;
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
