/**
 * https://github.com/electron/spectron#properties
 * https://jestjs.io/docs/en/expect
 */

const Application = require('spectron').Application;
const defaults = require('../user-preferences');

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

  test('should be visible', async () => {
    const isVisible = await app.browserWindow.isVisible();
    expect(isVisible).toBe(true);
  });

  test('should have the correct title', async () => {
    const title = await app.client.getTitle();
    expect(title).toBe('SikhiToTheMax');
  });

  describe('Nav tabs', () => {
    test('should be able to click on the tabs', async () => {
      const mainTabString = await app.client.getAttribute('#history-tab-content', 'class');
      const mainTab = mainTabString.split(' ');
      expect(mainTab).toContain('active');

      await app.client.click('#themes-tab');
      let classListString = await app.client.getAttribute('#themes-tab-content', 'class');
      let classList = classListString.split(' ');
      expect(classList).toContain('active');

      await app.client.click('#insert-tab');
      classListString = await app.client.getAttribute('#insert-tab-content', 'class');
      classList = classListString.split(' ');
      expect(classList).toContain('active');

      await app.client.click('#settings-tab');
      classListString = await app.client.getAttribute('#settings-tab-content', 'class');
      classList = classListString.split(' ');
      expect(classList).toContain('active');
    });
  });

  describe('Themes', () => {
    test('app contains default theme', async () => {
      const classListString = await app.client.getAttribute('body', 'class');
      const classList = classListString.split(' ');

      expect(classList).toContain(defaults.userPrefs.app.theme);
    });

    test('that the tabs are clickable', async () => {
      await app.client.click('#themes-tab');
      await app.client.click('.Dark');

      let classListString = await app.client.getAttribute('body', 'class');
      let classList = classListString.split(' ');

      expect(classList).toContain('dark-theme');

      await app.client.click('.Light');

      classListString = await app.client.getAttribute('body', 'class');
      classList = classListString.split(' ');

      expect(classList).toContain('light-theme');
    });
  });
});
