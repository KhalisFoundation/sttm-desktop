/**
 * Checks imports into `akhandpatt/` against its documented entry points.
 *
 * Its README identifies `ShabadDeck` and `AutoPlayIcon` as entry points and names
 * the modules each imports.
 *
 * A new import may belong in a shared module, or it may be a new entry point
 * that needs adding to the list below and the README.
 */
const path = require('path');
const {
  moduleSpecifiers,
  specifiersInSource,
  sourceFiles,
} = require('../../helpers/module-specifiers');

const MAIN_DIR = path.join(__dirname, '..', '..', '..', 'www', 'main');
const AKHANDPATT_DIR = path.join(MAIN_DIR, 'viewer', 'akhandpatt');

/** The documented entry points, as `importer -> module` pairs. */
const PUBLIC_ENTRY_POINTS = new Set([
  // The deck drives the scroll and is told when a reflow moved the reader's line.
  'viewer/ShabadDeck/ShabadDeck.jsx -> useAkhandpattScroll',
  'viewer/ShabadDeck/ShabadDeck.jsx -> layout-revision',
  // The scroll control shares the speed range so its slider and the scroll loop
  // cannot disagree about the bounds.
  'viewer/Slide/AutoPlayIcon.jsx -> scroll-config',
]);

/** The module a specifier enters `akhandpatt/` through, or null. */
const entered = (specifier) => {
  const match = /(?:^|\/)akhandpatt\/([\w-]+?)(?:\.jsx?)?$/.exec(specifier);
  return match ? match[1] : null;
};

const crossings = () =>
  sourceFiles(MAIN_DIR)
    .filter((file) => !file.startsWith(AKHANDPATT_DIR))
    .flatMap((file) => {
      const importer = path.relative(MAIN_DIR, file).split(path.sep).join('/');
      return moduleSpecifiers(file)
        .map(entered)
        .filter(Boolean)
        .map((module) => `${importer} -> ${module}`);
    });

describe('the akhandpatt module boundary', () => {
  it('is only entered through its documented modules', () => {
    const found = crossings();
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((entry) => !PUBLIC_ENTRY_POINTS.has(entry))).toEqual([]);
  });

  it('is scanned for every form an import can take', () => {
    const code = [
      "import a from '../akhandpatt/scroll-config';",
      'import b from "../akhandpatt/shabad-feed";',
      "export { c } from '../akhandpatt/scroll-motion';",
      "const d = require('../akhandpatt/verse-elements');",
      "const e = import('../akhandpatt/layout-revision');",
      "// import f from '../akhandpatt/not-an-import';",
      "const g = '../akhandpatt/not-an-import-either';",
      'export default [a, b, c, d, e, g];',
    ].join('\n');

    expect(specifiersInSource(code, 'sample.js').map(entered).filter(Boolean)).toEqual([
      'scroll-config',
      'shabad-feed',
      'scroll-motion',
      'verse-elements',
      'layout-revision',
    ]);
  });

  it('recognises a crossing however the specifier is written', () => {
    expect(entered('../akhandpatt/scroll-config')).toBe('scroll-config');
    expect(entered('./viewer/akhandpatt/scroll-config.js')).toBe('scroll-config');
    // A sibling directory whose name merely ends in `akhandpatt` is not a crossing.
    expect(entered('../not-akhandpatt/scroll-config')).toBeNull();
    expect(entered('react')).toBeNull();
  });
});
