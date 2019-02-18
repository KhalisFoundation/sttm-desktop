/**
 * https://github.com/electron/spectron#properties
 * https://jestjs.io/docs/en/expect
 */

const Application = require('spectron').Application;

const appPAth = process.env.TESTING_APP_PATH;
let app;

describe('Application launch', () => {
  beforeEach(async () => {
    app = new Application({
      path: appPAth,
    });
    await app.start();
    return app.client.waitUntilWindowLoaded();
  });

  afterEach(() => {
    if (app && app.isRunning()) {
      return app.stop();
    }
    return false;
  });

  test('true is true', async () => { // true
    expect(true).toBe(true);
  });

  test('app is visible', async () => {
    const isVisible = await app.browserWindow.isVisible();
    expect(isVisible).toBe(true);
  });

  test('app has the correct title', async () => {
    const title = await app.client.getTitle();
    expect(title).toBe('SikhiToTheMax');
  });

  test('app the changelog open', async () => {
    // the main window, the display window, and the change log.
    expect(await app.client.getWindowCount()).toBe(3);
  });

  test('app contains default theme', async () => {
    const classListString = await app.client.getAttribute('body', 'class');
    const classList = classListString.split(' ');

    expect(classList).toContain('light-theme');
  });
});
