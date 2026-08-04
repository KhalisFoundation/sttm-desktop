/**
 * Every locale key named in the source has to exist in the locale file.
 *
 * i18next answers an unknown key with the key itself, so a typo or a forgotten
 * entry does not throw; it puts `AUTOPLAY.PAUSE` on screen where the label
 * should be. This suite checks literal key uses during the build.
 *
 * This runs over the whole of `www/main` because the rule is not specific to
 * Akhand Paatth.
 *
 * This scans literal calls because `i18n` is reached through
 * `remote.require('./app')` and the resolver exists only inside a running
 * Electron main process.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SOURCE_DIR = path.join(REPO, 'www', 'main');
const LOCALE = path.join(REPO, 'www', 'locales', 'en.json');

/**
 * Keys assembled at runtime, e.g. i18n.t(`SEARCH.SOURCES.${id}`). Only the
 * fixed prefix is visible to a scan, so these are counted and skipped rather
 * than guessed at.
 */
const DYNAMIC_KEY = /i18n\.t\(\s*[`'"][^`'"]*\$\{/g;

/**
 * A key literal can sit anywhere in the argument list, not just first: the
 * scroll control chooses between two of them with a ternary. So the call is
 * matched first and every key-shaped literal inside it is collected.
 *
 * `[^)]*` stops at the first close paren, which truncates the handful of calls
 * containing a nested call. That can only cause a key to be missed, never
 * invented, and every such call builds its key by interpolation and is
 * unverifiable anyway. The count assertion below is what guards against the
 * pattern breaking wholesale.
 */
const I18N_CALL = /i18n\.t\(([^)]*)\)/g;
const KEY_LITERAL = /[`'"]([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)*)[`'"]/g;

const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(entry.name) ? [full] : [];
  });

/** @returns {{key: string, where: string}[]} every literal key named in a file. */
const keysNamedIn = (file) => {
  const where = path.relative(REPO, file).replace(/\\/g, '/');
  return [...fs.readFileSync(file, 'utf8').matchAll(I18N_CALL)].flatMap((call) =>
    [...call[1].matchAll(KEY_LITERAL)].map((literal) => ({ key: literal[1], where })),
  );
};

const usages = sourceFiles(SOURCE_DIR).flatMap(keysNamedIn);

const locale = JSON.parse(fs.readFileSync(LOCALE, 'utf8'));
const lookup = (key) =>
  key.split('.').reduce((node, part) => (node === undefined ? undefined : node[part]), locale);

describe('locale keys', () => {
  /**
   * Without this, a regex that quietly stopped matching would leave every
   * assertion below iterating an empty list and passing. The bound is the count
   * at the time of writing, rounded well down: it is asserting that the scan
   * still works, not pinning the size of the app.
   */
  it('finds the keys it is meant to be checking', () => {
    expect(usages.length).toBeGreaterThan(200);
    expect(new Set(usages.map((u) => u.key)).size).toBeGreaterThan(100);
  });

  it('resolves every key named in the source to a string', () => {
    const unresolved = usages
      .filter(({ key }) => typeof lookup(key) !== 'string')
      .map(({ key, where }) => `${key}  (${where})`);

    expect(unresolved).toEqual([]);
  });

  /**
   * Entries with no literal reader are not checked. Whole sections are reached
   * through interpolated keys, so absence of a literal does not establish that
   * an entry is unused.
   */
  it('leaves the interpolated keys to the reader', () => {
    const dynamic = sourceFiles(SOURCE_DIR).filter((file) =>
      DYNAMIC_KEY.test(fs.readFileSync(file, 'utf8')),
    );
    expect(dynamic.length).toBeGreaterThan(0);
  });

  describe('the Akhand Paatth controls', () => {
    const required = [
      'SPACING_TOOLS.SELF',
      'SPACING_TOOLS.BETWEEN_VERSES',
      'SPACING_TOOLS.BETWEEN_LINES',
      'AUTOPLAY.START',
      'AUTOPLAY.PAUSE',
      'AUTOPLAY.SPEED_DOWN',
      'AUTOPLAY.SPEED_UP',
      'AUTOPLAY.SPEED',
      'AUTOPLAY.SPEED_CURRENT',
    ];

    it.each(required)('%s is defined', (key) => {
      expect(typeof lookup(key)).toBe('string');
      expect(lookup(key).length).toBeGreaterThan(0);
    });

    /**
     * The scroll control's labels are read by a screen reader and nothing else,
     * so a missing one is invisible on screen. This ties them to the component
     * that names them, which the repo-wide scan above cannot do on its own: it
     * would still pass if the component stopped asking for them entirely.
     */
    it('are the ones the control actually asks for', () => {
      const asked = keysNamedIn(path.join(SOURCE_DIR, 'viewer', 'Slide', 'AutoPlayIcon.jsx')).map(
        ({ key }) => key,
      );
      expect(asked.sort()).toEqual(required.filter((key) => key.startsWith('AUTOPLAY.')).sort());
    });
  });
});
