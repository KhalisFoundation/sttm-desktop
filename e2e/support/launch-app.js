// Starts the built desktop app under Playwright, once per test, with a fresh
// user-data directory so settings, history and favourites begin empty.
//
// Needs `npm run build` first (the HTML files load www/js/*.js and the CSS
// bundles). The Realm database comes from e2e/.cache/database.json, written
// by e2e/global-setup.js: the installed app's copy, STTM_E2E_REALM_DIR, or
// what scripts/fetch-realm.mjs downloaded.
const { _electron: electron, test: base } = require('@playwright/test');
// The electron package's default export is the path of its binary.
const electronPath = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SearchWindow } = require('./search-window');
const { ViewerWindow } = require('./viewer-window');

const APP_DIR = path.resolve(__dirname, '..', '..');
const DATABASE_INFO = path.join(APP_DIR, 'e2e', '.cache', 'database.json');

function databaseInfo() {
  if (!fs.existsSync(DATABASE_INFO)) {
    throw new Error(`${DATABASE_INFO} is missing; the Playwright global setup writes it`);
  }
  return JSON.parse(fs.readFileSync(DATABASE_INFO, 'utf8'));
}

/**
 * Puts `source` at `target` without copying 225 MB per test: a symlink, else a
 * hard link, else (another volume, or no symlink rights on Windows) a copy.
 */
function placeFile(source, target) {
  try {
    fs.symlinkSync(source, target);
    return;
  } catch {
    // fall through
  }
  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
}

/** The BrowserWindow whose URL ends with `file`, waiting for it to open. */
async function waitForWindow(app, file, timeout = 30000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const page = app.windows().find((window) => window.url().endsWith(file));
    if (page) return page;
    if (Date.now() > deadline) throw new Error(`No window for ${file} after ${timeout}ms`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
}

/**
 * Launches the app and waits for the main window to be interactive.
 *
 * `options.prefs` are entries for `userPrefs` in user-preferences.json (e.g.
 * { app: { layout: { 'presenter-view': false } } }); `options.settings` are
 * display settings for user-data.json, by their id in
 * www/configs/user-settings.json (e.g. { 'bani-length': 'long' });
 * `options.args` are extra Chromium switches, e.g. a fake microphone.
 */
// The viewer (a <webview> on one display, its own window with a second one)
// can finish loading after the search box is ready. A slide sent before then
// is lost, so tests wait until the viewer page has loaded.
async function waitForViewer(app, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await app
      .evaluate(async ({ webContents }) => {
        const viewer = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL().endsWith('viewer.html'));
        if (!viewer || viewer.isDestroyed() || viewer.isLoading()) return false;
        return viewer.executeJavaScript("document.readyState === 'complete'");
      })
      .catch(() => false);
    if (ready) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  throw new Error('The viewer did not finish loading');
}

async function launchApp(options = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sttm-e2e-'));
  const { version } = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
  const database = databaseInfo();

  // The database the app would otherwise download on first start, and the
  // hashes that tell it the copies are current.
  placeFile(database.realm, path.join(userDataDir, path.basename(database.realm)));
  placeFile(database.schema, path.join(userDataDir, path.basename(database.schema)));
  const aiHashHex = (database.aiHash.match(/[a-f0-9]{32}/i) || [''])[0];
  const aiFile = aiHashHex ? `ai-translations-${aiHashHex}.db` : '';
  if (aiFile) fs.writeFileSync(path.join(userDataDir, aiFile), '');

  fs.writeFileSync(
    path.join(userDataDir, 'user-preferences.json'),
    JSON.stringify({
      // Mark the changelog as seen so the first launch doesn't open it over the app.
      'changelog-seen': version,
      'changelog-seen-count': 99,
      curDBHash: database.dbHash,
      ...(aiFile ? { aiTranslationsFile: aiFile, aiTranslationsHash: database.aiHash } : {}),
      userPrefs: options.prefs || {},
    }),
  );

  if (options.settings) {
    const { settings } = JSON.parse(
      fs.readFileSync(path.join(APP_DIR, 'www', 'configs', 'user-settings.json'), 'utf8'),
    );
    const values = Object.fromEntries(
      Object.entries(settings).map(([key, setting]) => [key, setting.initialValue]),
    );
    fs.writeFileSync(
      path.join(userDataDir, 'user-data.json'),
      JSON.stringify({ ...values, ...options.settings }),
    );
  }

  const app = await electron.launch({
    executablePath: electronPath,
    cwd: APP_DIR,
    args: [
      '.',
      `--user-data-dir=${userDataDir}`,
      // Electron's SUID sandbox helper isn't set up on CI runners or dev
      // machines; the app under test doesn't load remote content.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...(options.args || []),
    ],
    env: {
      ...process.env,
      // No update checks; the staging API, like `npm run start`.
      NODE_ENV: 'development',
    },
    timeout: 60000,
  });

  const main = await waitForWindow(app, 'index.html');
  await main.waitForLoadState('domcontentloaded');
  await main.locator('input.input-box').waitFor({ state: 'visible', timeout: 45000 });
  // The search box is enabled once the database has opened.
  await main.locator('input.input-box:not([disabled])').waitFor({ timeout: 30000 });
  await waitForViewer(app);
  return { app, main, userDataDir };
}

async function closeApp({ app, userDataDir }) {
  // A window that refuses to close (a native dialog, a full-screen slide)
  // must not hold the run: the process is killed after a grace period.
  let timer;
  const killAfter = new Promise((resolve) => {
    timer = setTimeout(() => {
      try {
        app.process().kill();
      } catch {
        // already gone
      }
      resolve();
    }, 15000);
  });
  await Promise.race([app.close().catch(() => undefined), killAfter]);
  clearTimeout(timer);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

/**
 * Makes the native folder picker answer with `directory` instead of opening.
 * The renderer calls dialog.showOpenDialogSync through @electron/remote, which
 * looks the method up on the main process's dialog module at call time.
 */
async function stubFolderPicker(app, directory) {
  await app.evaluate(({ dialog }, chosen) => {
    // eslint-disable-next-line no-param-reassign
    dialog.showOpenDialogSync = () => [chosen];
    // eslint-disable-next-line no-param-reassign
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, directory);
}

/** Hands the app a signed-in account's token, as the SSO deep link does. */
async function signInWithToken(app, token) {
  await app.evaluate(({ BrowserWindow }, value) => {
    BrowserWindow.getAllWindows()
      .filter((window) => window.webContents.getURL().endsWith('index.html'))
      .forEach((window) => window.webContents.send('userToken', value));
  }, token);
}

/** Opens the Bani Overlay window (Ctrl+Shift+O in the menu) and returns it. */
async function openOverlayWindow(main, app) {
  await main.evaluate(() => {
    window.require('@electron/remote').require('./app').openSecondaryWindow('overlayWindow');
  });
  const overlay = await waitForWindow(app, 'overlay.html');
  await overlay.waitForLoadState('domcontentloaded');
  return overlay;
}

/** `test` with the app launched fresh for every test. */
const test = base.extend({
  /** How the app is started; a describe block can change it with test.use(). */
  appLaunch: [{}, { option: true }],
  launched: async ({ appLaunch }, use, testInfo) => {
    const launched = await launchApp(appLaunch);
    await use(launched);
    if (testInfo.status !== testInfo.expectedStatus) {
      await launched.main
        .screenshot({ path: testInfo.outputPath('main-window.png'), timeout: 5000 })
        .catch(() => undefined);
    }
    await closeApp(launched);
  },
  app: async ({ launched }, use) => {
    await use(launched.app);
  },
  /** The main (search) window. */
  main: async ({ launched }, use) => {
    await use(launched.main);
  },
  search: async ({ launched }, use) => {
    await use(new SearchWindow(launched.main));
  },
  viewer: async ({ launched }, use) => {
    await use(new ViewerWindow(launched.app));
  },
  /** Signs in with STTM_E2E_USER_TOKEN; the test should skip when it is unset. */
  signIn: async ({ launched }, use) => {
    await use(async () => {
      const token = process.env.STTM_E2E_USER_TOKEN;
      if (!token) throw new Error('STTM_E2E_USER_TOKEN is not set');
      await signInWithToken(launched.app, token);
    });
  },
  openOverlay: async ({ launched }, use) => {
    await use(() => openOverlayWindow(launched.main, launched.app));
  },
});

module.exports = {
  APP_DIR,
  closeApp,
  expect: base.expect,
  launchApp,
  openOverlayWindow,
  signInWithToken,
  stubFolderPicker,
  test,
  waitForWindow,
};
