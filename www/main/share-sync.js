const request = require('request-promise');
const { remote } = require('electron');

const { store, i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const Noty = require('noty');
const { API_ENDPOINT: SYNC_API_URL } = require('./api-config');

const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

function onConnect(namespaceString) {
  window.socket = window.io(`${SYNC_API_URL}/${namespaceString}`);
}

async function getNewCode(host) {
  let newCode = null;
  try {
    const result = await request(`${SYNC_API_URL}/sync/begin/${host}`);
    const {
      data: { namespaceString },
    } = JSON.parse(result);

    if (window.io !== undefined) {
      window.namespaceString = namespaceString;
      onConnect(namespaceString);
    }

    newCode = namespaceString;
  } catch (error) {
    analytics.trackEvent('sync', 'error', error);
    new Noty({
      type: 'error',
      text: i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'),
      timeout: 3000,
      modal: true,
    }).show();
    newCode = null;
  }
  return newCode;
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
    let syncCode = null;

    // if a succesful code already exists, use that or else get new code
    try {
      await request(`${SYNC_API_URL}/sync/join/${window.namespaceString}`);
      syncCode = window.namespaceString;
    } catch (e) {
      syncCode = getNewCode(host);
    }

    return syncCode;
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
    window.socket = null;
    window.namespaceString = null;
  },
};
