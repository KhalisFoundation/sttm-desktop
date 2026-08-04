/**
 * Checks the settings included in `LAYOUT_AFFECTING_SETTINGS`.
 *
 * The Akhand Paatth deck holds the reader's place across a reflow by being told
 * that one happened. If a setting that changes a verse's height is missing from
 * that list, adjusting it can slide the reader's place away.
 *
 * Every setting the Slide subtree reads is partitioned here: it is either
 * height-affecting, and named in the module's list, or height-neutral, and named
 * in the allow-list below. A setting not present in either list fails this test.
 */
const fs = require('fs');
const path = require('path');

const {
  LAYOUT_AFFECTING_SETTINGS,
  LAYOUT_AFFECTING_VIEWER_SETTINGS,
  buildLayoutRevision,
} = require('../../../www/main/viewer/akhandpatt/layout-revision');

const SLIDE_DIR = path.join(__dirname, '..', '..', '..', 'www', 'main', 'viewer', 'Slide');
const VIEWER_DIR = path.join(__dirname, '..', '..', '..', 'www', 'main', 'viewer');
// The Slide subtree reads its type sizes through these, so the names they can
// land on are part of what the list has to cover.
const EXTRA_SOURCES = [
  path.join(VIEWER_DIR, 'hooks', 'bakePanktee.js'),
  path.join(VIEWER_DIR, 'hooks', 'useContentFontSizes.js'),
  path.join(VIEWER_DIR, 'font-sizes.js'),
];

/**
 * Settings the Slide subtree reads that cannot change a verse's height.
 *
 * Kept in the test rather than the module because the app does not use them.
 * They make the partition below total, so "not in
 * `LAYOUT_AFFECTING_SETTINGS`" is explicit.
 */
const HEIGHT_NEUTRAL_SETTINGS = [
  'announcements',
  // Colour and decoration only.
  'theme',
  'themeBg',
  // Vishraams and Larivaar assist are rendered by adding a class to a word
  // (`bakePanktee`'s `getVishraamStyle`), never by inserting glyphs or spacing,
  // so they recolour a verse without resizing it. `larivaar` removes spaces and
  // changes where lines wrap, so it is classified as height-affecting.
  'vishraamType',
  'vishraamOption',
  'vishraamSource',
  'vishraams',
  'displayVishraams',
  'larivaarAssist',
  'larivaarAssistType',
  // Alignment moves a line across the page, not down it.
  'leftAlign',
  'centerAlign',
  'displayOptions',
  'autoslide',
  'slideTransitions',
  'akhandpatt',
  'autoplayToggle',
  'akhandpattScrollSpeed',
  'gurbaniFont',
  'baniLength',
  'mangalPosition',
  'liveFeed',
];

/**
 * Viewer settings the deck reads that cannot move a verse.
 *
 * The counterpart of `HEIGHT_NEUTRAL_SETTINGS` for the other store slice, and
 * empty today: everything `ShabadDeck` takes from `viewerSettings` currently
 * affects layout. It exists so that adding one is a decision rather than an
 * omission.
 */
const HEIGHT_NEUTRAL_VIEWER_SETTINGS = [];

const readSlideSubtree = () => {
  const files = fs
    .readdirSync(SLIDE_DIR)
    .filter((name) => /^Slide.*\.jsx?$/.test(name))
    .map((name) => path.join(SLIDE_DIR, name))
    .concat(EXTRA_SOURCES);

  return files.map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
};

describe('buildLayoutRevision', () => {
  const base = Object.fromEntries(LAYOUT_AFFECTING_SETTINGS.map((key, i) => [key, i]));
  const viewer = Object.fromEntries(
    LAYOUT_AFFECTING_VIEWER_SETTINGS.map((key, i) => [key, 16 + i]),
  );

  it('is stable for unchanged settings', () => {
    expect(buildLayoutRevision(base, viewer)).toBe(buildLayoutRevision({ ...base }, { ...viewer }));
  });

  it.each(LAYOUT_AFFECTING_VIEWER_SETTINGS)('changes when %s changes', (key) => {
    const changed = { ...viewer, [key]: 40 };
    expect(buildLayoutRevision(base, changed)).not.toBe(buildLayoutRevision(base, viewer));
  });

  it.each(LAYOUT_AFFECTING_SETTINGS)('changes when %s changes', (key) => {
    const changed = { ...base, [key]: 'different' };
    expect(buildLayoutRevision(changed, viewer)).not.toBe(buildLayoutRevision(base, viewer));
  });

  it('is not confused by two settings swapping values', () => {
    // A naive `Object.values(...).sort().join()` would collide here.
    const swapped = { ...base, gurbaniFontSize: base.content1FontSize };
    const alsoSwapped = { ...base, content1FontSize: base.gurbaniFontSize };
    expect(buildLayoutRevision(swapped, viewer)).not.toBe(buildLayoutRevision(alsoSwapped, viewer));
  });

  it('is not confused by the two spacing axes swapping values', () => {
    // The axes do different jobs, so the token must distinguish a deck laid out
    // 28/26 from one laid out 26/28.
    expect(buildLayoutRevision(base, { verseSpacing: 28, lineSpacing: 26 })).not.toBe(
      buildLayoutRevision(base, { verseSpacing: 26, lineSpacing: 28 }),
    );
  });

  describe('container padding', () => {
    // The only setting in either list that is an object rather than a number.
    // Joined directly it renders as `[object Object]` for every value it can
    // hold, so every padding would look identical to the anchor repair.
    const padded = (edges) => ({ ...viewer, containerPadding: { ...edges } });
    const DEFAULT_EDGES = { top: 20, right: 10, bottom: 20, left: 10 };

    it('reaches the token at all', () => {
      expect(buildLayoutRevision(base, padded(DEFAULT_EDGES))).not.toContain('[object Object]');
    });

    it('changes when a vertical edge moves, which translates every verse', () => {
      expect(buildLayoutRevision(base, padded({ ...DEFAULT_EDGES, top: 60 }))).not.toBe(
        buildLayoutRevision(base, padded(DEFAULT_EDGES)),
      );
    });

    it('changes when a horizontal edge moves, which rewraps every verse', () => {
      expect(buildLayoutRevision(base, padded({ ...DEFAULT_EDGES, left: 60 }))).not.toBe(
        buildLayoutRevision(base, padded(DEFAULT_EDGES)),
      );
    });

    it('is stable when the same edges arrive in a different key order', () => {
      expect(buildLayoutRevision(base, padded({ left: 10, bottom: 20, right: 10, top: 20 }))).toBe(
        buildLayoutRevision(base, padded(DEFAULT_EDGES)),
      );
    });
  });

  it('ignores settings that do not affect layout', () => {
    const themed = { ...base, theme: 'dark', vishraamType: 'colored-words' };
    expect(buildLayoutRevision(themed, viewer)).toBe(buildLayoutRevision(base, viewer));
  });
});

describe('LAYOUT_AFFECTING_VIEWER_SETTINGS', () => {
  // The control writes through `setVerseSpacing` / `setLineSpacing`, so the two
  // lists form one contract split across a store boundary. If a third axis
  // is ever added to the control it has to reach the anchor repair too.
  it('covers every spacing axis the control offers', () => {
    const control = fs.readFileSync(path.join(VIEWER_DIR, 'Slide', 'SpacingTools.jsx'), 'utf8');
    const offered = new Set(
      (control.match(/stateName: '(\w+)'/g) || []).map((m) => m.split("'")[1]),
    );

    expect(offered.size).toBeGreaterThan(0);
    offered.forEach((name) => {
      expect(LAYOUT_AFFECTING_VIEWER_SETTINGS).toContain(name);
    });
  });

  /**
   * `containerPadding` also moves the deck. It is applied by `ShabadDeck` rather
   * than the Slide subtree, so the deck's viewer settings are partitioned here
   * too.
   */
  it('classifies every viewer setting the deck reads', () => {
    const deck = fs.readFileSync(path.join(VIEWER_DIR, 'ShabadDeck', 'ShabadDeck.jsx'), 'utf8');
    const destructured = deck.match(
      /const\s*\{([^}]*)\}\s*=\s*useStoreState\(\s*\(state\)\s*=>\s*state\.viewerSettings/,
    );

    expect(destructured).not.toBeNull();
    const read = destructured[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    expect(read.length).toBeGreaterThan(0);
    read.forEach((name) => {
      expect(
        LAYOUT_AFFECTING_VIEWER_SETTINGS.includes(name) ||
          HEIGHT_NEUTRAL_VIEWER_SETTINGS.includes(name),
      ).toBe(true);
    });
  });
});

describe('LAYOUT_AFFECTING_SETTINGS', () => {
  it('has no duplicates', () => {
    expect(new Set(LAYOUT_AFFECTING_SETTINGS).size).toBe(LAYOUT_AFFECTING_SETTINGS.length);
  });

  it('lists every font size the Slide subtree renders with', () => {
    // Font sizes are the clearest case: any `*FontSize` a Slide component reads
    // scales rendered text, so it must be able to trigger an anchor repair.
    const readSizes = new Set();
    readSlideSubtree().forEach(({ source }) => {
      const matches =
        source.match(/\b(?:akhandpatt)?(?:[Gg]urbani|[Cc]ontent\d+)FontSize\b/g) || [];
      matches.forEach((name) => readSizes.add(name));
    });

    expect(readSizes.size).toBeGreaterThan(0);
    readSizes.forEach((name) => {
      expect(LAYOUT_AFFECTING_SETTINGS).toContain(name);
    });
  });

  it('lists every content-visibility flag the Slide subtree renders with', () => {
    const readFlags = new Set();
    readSlideSubtree().forEach(({ source }) => {
      const matches = source.match(/\bcontent\d+Visibility\b/g) || [];
      matches.forEach((name) => readFlags.add(name));
    });

    expect(readFlags.size).toBeGreaterThan(0);
    readFlags.forEach((name) => {
      expect(LAYOUT_AFFECTING_SETTINGS).toContain(name);
    });
  });

  it('classifies every setting the Slide subtree reads exactly once', () => {
    // The two tests above pin the settings we already know matter. This one
    // catches an unclassified setting: anything the subtree reads from
    // `userSettings` must be an explicit member of one list or the other.
    const read = new Set();
    readSlideSubtree().forEach(({ source }) => {
      const matches = source.match(/\buserSettings\.(\w+)/g) || [];
      matches.forEach((match) => read.add(match.split('.')[1]));
    });

    expect(read.size).toBeGreaterThan(0);
    const unclassified = [...read].filter(
      (name) =>
        !LAYOUT_AFFECTING_SETTINGS.includes(name) && !HEIGHT_NEUTRAL_SETTINGS.includes(name),
    );
    expect(unclassified).toEqual([]);
  });

  it('does not classify any setting as both', () => {
    // Totality alone is not a partition. A key in both lists would satisfy the
    // test above while being described as both height-affecting and
    // height-neutral.
    const both = LAYOUT_AFFECTING_SETTINGS.filter((name) => HEIGHT_NEUTRAL_SETTINGS.includes(name));
    expect(both).toEqual([]);
  });
});
