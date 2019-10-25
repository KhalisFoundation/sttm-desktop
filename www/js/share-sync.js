const request = require('request-promise');
const { store } = require('electron').remote.require('./app');

const SYNC_API_URL = 'https://api.sikhitothemax.org';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

function onConnect(namespaceString) {
  window.socket = window.io(`${SYNC_API_URL}/${namespaceString}`);
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
      const {
        data: { namespaceString },
      } = JSON.parse(result);

      if (window.io !== undefined) {
        window.namespaceString = namespaceString;
        onConnect(namespaceString);
      } else {
        // TODO: Wait for io or something
      }
      return namespaceString;
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
