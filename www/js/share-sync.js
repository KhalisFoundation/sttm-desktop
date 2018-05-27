const { promisify } = require('util');
const request = promisify(require('request'));

const SYNC_API_URL = 'http://localhost:1337';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

module.exports = {
  $content: null,
  $connectBox: null,
  $shareBox: null,
  $connectBtn: null,

  init() {
    // Inject socket.io script
    if (
      document.querySelector(`script[src="${SOCKET_SCRIPT_SOURCE}"]`) === null
    ) {
      const script = document.createElement('script');
      script.src = SOCKET_SCRIPT_SOURCE;
      document.body.appendChild(script);
    }

    this.$content = document.querySelector('#sync-page .block-list');
    this.$connectBtn = this.$content.querySelector('.connect-btn');
    this.$connectBox = this.$content.querySelector('.connect-box');
    this.$shareBox = this.$content.querySelector('.share-box');
    this.$shareBox.querySelector(
      'input[name="code"]',
    ).onclick = function onInputClick() {
      this.select();
    };

    this.$connectBtn.addEventListener('click', () => this.tryConnection());
  },
  async tryConnection() {
    const previousText = this.$connectBtn.textContent;
    this.$connectBtn.textContent = 'Loading...';

    const {
      body: { data, error },
    } = await request(`${SYNC_API_URL}/sync/begin`, {
      json: true,
    });

    this.$connectBtn.textContent = previousText;

    if (error) {
      this.$connectBox.querySelector('.help-block').textContent =
        "Couldn't establish connection with sync server";
    } else {
      const { namespaceString } = data;

      if (window.io !== undefined) {
        this.onConnect(namespaceString);
      } else {
        // TODO: Wait for io or something
      }
    }
  },
  onConnect(namespaceString) {
    this.$connectBox.classList.add('hidden');
    this.$shareBox.classList.remove('hidden');
    this.$shareBox
      .querySelector('input')
      .setAttribute('value', namespaceString);

    this.$shareBox.querySelector('.end-btn').onclick = () =>
      this.onEnd(namespaceString);

    window.socket = window.io(`${SYNC_API_URL}/${namespaceString}`);
  },
  async onEnd(namespaceString) {
    window.socket.disconnect();
    await request(`${SYNC_API_URL}/sync/end/${namespaceString}`);
    window.socket = undefined;
    this.$connectBox.classList.remove('hidden');
    this.$shareBox.classList.add('hidden');
  },
};
