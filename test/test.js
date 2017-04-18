const Application = require('spectron').Application;
const assert = require('assert');

describe('application launch', function cb() {
  this.timeout(10000);

  beforeEach(function be() {
    this.app = new Application({
      path: `${__dirname}/../node_modules/.bin/electron`,
      args: ['app.js'],
    });
    return this.app.start();
  });

  afterEach(function ae() {
    if (this.app && this.app.isRunning()) {
      return this.app.stop();
    }
    return false;
  });

  it('shows an initial window', function itcb() {
    return this.app.client.getWindowCount().then((count) => {
      assert.equal(count, 1);
    });
  });
});
