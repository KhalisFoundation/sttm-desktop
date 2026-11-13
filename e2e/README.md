# End-to-end tests

Playwright drives the built desktop app the way a tester does: it starts Electron with a fresh user-data directory, types into the search bar, presses the shortcuts, and reads what the viewer shows. Every test is named after a row of the QA sheet, so a run can be read back against the sheet.

## Run locally

```sh
npm run build                 # www/js/*.js and the CSS bundles
npm run e2e                   # everything
npm run e2e:fast              # the quick set CI runs on every PR (@fast)
npx playwright test --project=desktop -g SRCH   # one group
```

On Linux without a display: `xvfb-run -a npm run e2e`.

The tests need the Realm database. The global setup looks, in order, at `STTM_E2E_REALM_DIR`, the installed app's data folder (`~/.config/SikhiToTheMax` on Linux, `~/Library/Application Support/SikhiToTheMax` on macOS, `%APPDATA%\SikhiToTheMax` on Windows), then `e2e/.cache`, which `node e2e/scripts/fetch-realm.mjs` fills. Each launch links the database into its temporary user-data directory and records the published hashes so the app doesn't download anything in the background.

The app runs with `NODE_ENV=development`: no update checks, and the staging API (`stgapi.sikhitothemax.org`) as `npm start` uses. The staging sync server may hand out no code, so the Sync rows that need one skip with that reason; they run against a build pointed at the production API.

Optional environment:

| Variable              | Enables                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `STTM_E2E_USER_TOKEN` | Login and favourites tests (`FAV-*`, `MULTI-12`), with that Khalis account's token                                                           |
| `STTM_E2E_SYNC_WEB=1` | The sttm-web half of the Sync tests (`SYNC-04`, `SYNC-06`), which opens www.sikhitothemax.org/control and /sync against the live sync server |
| `STTM_E2E_REALM_DIR`  | A folder holding `sttmdesktop-evergreen-v2.realm` and `realm-schema-evergreen.json`                                                          |

## The sheet and the IDs

`e2e/cases.json` is generated from the sheet's CSV export (`e2e/cases/sttm-desktop-<version>.csv`) by `npm run e2e:cases`. Each row gets `<GROUP>-<nn>` by its position in its group (SRCH-01 is the first Search row), plus an `automation` value:

- `auto`: fully covered by a test.
- `partial`: the mechanical part is tested, a judgement or an outside step is not (e.g. the custom-theme upload dialog, the "paste into OBS" step).
- `manual`: needs hardware or a person (second display, Chromecast, SSO login, speech recognition).

Add new sheet rows at the end of their group so existing IDs keep their meaning. The IDs are the same as in sttm-desktop-next's suite, so one sheet serves both apps.

`npm run e2e:report` turns the last run plus `cases.json` into `e2e/report.md` (generated, not committed): one row per sheet case with its result. Writing results back into the Google Sheet is prepared but needs a service account shared on the sheet (`GOOGLE_SHEETS_CREDENTIALS`, `GOOGLE_SHEET_ID`).

## Layout

- `playwright.config.js`: two projects, `desktop` (Electron) and `web` (a browser, for the pages the app pairs with); `e2e/global-setup.js` finds the database.
- `e2e/support/launch-app.js`: starts the app, the `test` fixture with `app`, `main`, `search`, `viewer`.
- `e2e/support/search-window.js`, `viewer-window.js`, `settings-panel.js`: page objects. The viewer is a `<webview>` on a single display, which Playwright cannot attach to, so its text is read through Electron's `webContents` from the main process.
- `e2e/tests/*.desktop.spec.js`, `*.web.spec.js`: one file per sheet group.

## Stays manual

Second-display detection (CORE-01), Chromecast (CAST-\*), signing in through SSO (FAV-01, FAV-05), pasting the overlay URL into OBS (OVERLAY-04), and recognising spoken Gurbani (VOICE-02, VOICE-03).
