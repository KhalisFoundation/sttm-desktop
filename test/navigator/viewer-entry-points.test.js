/**
 * `isMiscSlide` outranks everything else in the viewer: while set, `ShabadDeck`
 * skips all three content effects, so any code that opens content must clear the
 * flag first or it stays hidden. Scans literal calls that enable a content
 * source and checks the same file clears the flag; a dynamic or re-exported
 * caller is not matched.
 */
const fs = require('fs');
const path = require('path');

const MAIN = path.join(__dirname, '..', '..', 'www', 'main');

/** Every `.js`/`.jsx` file under `www/main`, keyed by path relative to it. */
const sourceFiles = () => {
  const found = new Map();
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.jsx?$/.test(entry.name)) {
        const key = path.relative(MAIN, full).split(path.sep).join('/');
        found.set(key, fs.readFileSync(full, 'utf8'));
      }
    });
  };
  walk(MAIN);
  return found;
};

// The three content sources `ShabadDeck` loads from. Switching any of them on is
// what makes a caller an entry point.
const OPENS_VIEWER_CONTENT = [
  /setActiveShabadId\(/,
  /setIsSundarGutkaBani\(true\)/,
  /setIsCeremonyBani\(true\)/,
];

const CLEARS_MISC_SLIDE = /setIsMiscSlide\(false\)/;

/**
 * The text between two markers. Both must be present: a missing one would
 * otherwise slice to the end of the file and quietly widen whatever is asserted
 * against the result, turning a renamed function into a passing test.
 */
const sliceBetween = (source, startMarker, endMarker, file) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${file}: cannot isolate '${startMarker}'..'${endMarker}'. ` +
        'If either was renamed, update this test rather than removing it.',
    );
  }
  return source.slice(start, end);
};

/**
 * Shared helpers that switch on a content source after an entry point has
 * cleared the flag. Each names the expected direct caller; the literal call
 * sites are compared below.
 */
const DELEGATED = {
  'navigator/shabad/utils/change-verse.js': {
    exportedAs: 'changeVerse',
    clearedBy: 'navigator/shabad/ShabadText.jsx',
  },
};

const files = sourceFiles();

const entryPoints = [...files.entries()]
  .filter(([, source]) => OPENS_VIEWER_CONTENT.some((pattern) => pattern.test(source)))
  .map(([file]) => file);

describe('matched viewer entry points clear the misc slide', () => {
  it('finds viewer entry points', () => {
    expect(entryPoints.length).toBeGreaterThanOrEqual(9);
  });

  it.each(entryPoints)('%s', (file) => {
    if (DELEGATED[file]) {
      return;
    }
    expect(files.get(file)).toMatch(CLEARS_MISC_SLIDE);
  });
});

describe('delegated helpers have the expected literal caller', () => {
  it.each(Object.keys(DELEGATED))('%s', (file) => {
    const { exportedAs, clearedBy } = DELEGATED[file];

    expect(files.has(clearedBy)).toBe(true);
    expect(files.get(clearedBy)).toMatch(CLEARS_MISC_SLIDE);

    // The exemption expects one literal caller. `utils/index.js` re-exports and
    // does not call.
    const callers = [...files.entries()]
      .filter(([name]) => name !== file && !name.endsWith('utils/index.js'))
      .filter(([, source]) => new RegExp(`\\b${exportedAs}\\(`).test(source))
      .map(([name]) => name);

    expect(callers).toEqual([clearedBy]);
  });
});

describe('showing a misc slide interrupts the reading rather than ending it', () => {
  /**
   * `addMiscSlide` used to turn the persisted `akhandpatt` setting off, a
   * workaround from when the continuous view could not stand a misc slide down.
   * The viewer now gates on `akhandpatt && !isMiscSlide`, so changing the
   * persisted setting would end the reading.
   *
   * Autoplay remains stopped so the reading returns stationary.
   */
  const useSlides = files.get('common/hooks/useSlides.js');
  const addMiscSlide = sliceBetween(
    useSlides,
    'const addMiscSlide',
    'const displayWaheguruSlide',
    'common/hooks/useSlides.js',
  );

  it('leaves the chosen view alone', () => {
    expect(addMiscSlide).not.toMatch(/setAkhandpatt\(/);
  });

  it('still stops autoplay', () => {
    expect(addMiscSlide).toMatch(/setAutoplayToggle\(false\)/);
  });
});

describe('which view is live is decided once', () => {
  /**
   * `akhandpatt` is the operator's chosen view; `akhandpatt && !isMiscSlide` is
   * whether the continuous view is actually on screen. Everything that renders,
   * measures or scrolls the deck keys off the second, and `ShabadDeck` works it
   * out once and passes the answer down.
   */
  const DERIVES_VIEW_IS_LIVE = {
    'viewer/ShabadDeck/ShabadDeck.jsx': 'owns the answer and hands it to everything it renders',
    // The navigator runs in the control window, the deck in the viewer; there is
    // no component tree between them to pass a prop down. Both read the same two
    // settings from the shared store. This site also checks whether the reading
    // advances itself.
    'navigator/shabad/ArrowIcon.jsx':
      'a different window, asking whether the reading advances itself',
  };

  const derivations = [...files.entries()]
    .filter(([, source]) => /akhandpatt\s*&&\s*!isMiscSlide/.test(source))
    .map(([file]) => file);

  it('matches the two current derivation sites', () => {
    expect(derivations.sort()).toEqual(Object.keys(DERIVES_VIEW_IS_LIVE).sort());
  });
});
