const { promisify } = require('util');
const request = promisify(require('request'));
const h = require('hyperscript');

const SYNC_API_URL = 'http://localhost:1337';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

module.exports = {
  $content: null,
  $connectBtn: null,

  init() {
    this.$content = document.querySelector('#sync-page .block-list');
    this.$connectBtn = this.$content.querySelector('.connect-btn');

    if (
      document.querySelector(`script[src="${SOCKET_SCRIPT_SOURCE}"]`) === null
    ) {
      const script = document.createElement('script');
      script.src = SOCKET_SCRIPT_SOURCE;
      document.body.appendChild(script);
    }

    Object.assign(this.$content.style, {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    });

    this.$connectBtn.addEventListener('click', () => this.tryConnection());
  },
  async tryConnection() {
    const {
      body: { data, error },
    } = await request(`${SYNC_API_URL}/sync/begin`, {
      json: true,
    });

    if (error) {
      // TODO: do something
      this.$content.appendChild(
        h('h1', "Couldn't establish connection with sync server"),
      );
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
    this.$connectBtn.classList.add('hidden');
    this.$connectBtn.style.display = 'none';
    window.socket = window.io(`${SYNC_API_URL}/${namespaceString}`);

    this.$content.appendChild(
      h(
        'div.share-box',
        {
          style: `
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
          `,
        },
        [
          h(
            'h1',
            {
              style: `
                margin; 10px;
                `,
            },
            'Ready to share!',
          ),
          h('input', {
            readonly: true,
            onclick() {
              this.select();
            },
            value: namespaceString,
          }),
          h(
            'button',
            {
              className: 'button',
              onclick: () => this.onEnd(namespaceString),
            },
            'Stop sharing',
          ),
        ],
      ),
    );
  },
  async onEnd(namespaceString) {
    window.socket.disconnect();
    await request(`${SYNC_API_URL}/sync/end/${namespaceString}`);
    window.socket = undefined;
    this.$connectBtn.classList.remove('hidden');
    this.$connectBtn.style.display = 'block';
    this.$content.querySelector('.share-box').remove();
  },
};
