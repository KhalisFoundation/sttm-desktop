const fs = require('fs');
const path = require('path');
const { ROOT, moduleSpecifiers, sourceFiles } = require('./helpers/module-specifiers');

const SOURCE_DIRS = ['www/main', 'test'];
const EXTENSIONS = ['', '.js', '.jsx', '.json'];

// `www/main/desktop_index.js` is loaded by `www/index.html` as a classic
// `<script src="js/desktop_index.js">`, so its relative requires resolve against
// `www/`, not against the file. They point at the Babel output in `www/js`,
// which is gitignored, so map them back onto the sources they are built from.
const BUILD_OUTPUT_ENTRY = path.join(ROOT, 'www/main/desktop_index.js');
const BUILD_OUTPUT_PREFIX = './js/';

const resolves = (fromFile, specifier) => {
  const base =
    fromFile === BUILD_OUTPUT_ENTRY && specifier.startsWith(BUILD_OUTPUT_PREFIX)
      ? path.join(ROOT, 'www/main', specifier.slice(BUILD_OUTPUT_PREFIX.length))
      : path.resolve(path.dirname(fromFile), specifier);
  const candidates = EXTENSIONS.map((ext) => base + ext).concat(
    EXTENSIONS.filter(Boolean).map((ext) => path.join(base, `index${ext}`)),
  );
  return candidates.some((candidate) => fs.existsSync(candidate));
};

const relativeSpecifiers = (file) =>
  moduleSpecifiers(file).filter((specifier) => specifier.startsWith('.'));

describe('every relative import', () => {
  const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

  it('is looked for across the whole source tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('is picked up by the scanner, in JSX as well as plain JS', () => {
    const deck = path.join(ROOT, 'www/main/viewer/ShabadDeck/ShabadDeck.jsx');
    expect(relativeSpecifiers(deck).length).toBeGreaterThan(0);
  });

  it('resolves to a file on disk', () => {
    const broken = [];
    files.forEach((file) => {
      relativeSpecifiers(file).forEach((specifier) => {
        if (!resolves(file, specifier)) {
          broken.push(`${path.relative(ROOT, file)} imports ${specifier}`);
        }
      });
    });
    expect(broken).toEqual([]);
  });

  it('is reported when it does not, so a passing run means something', () => {
    expect(resolves(path.join(ROOT, 'www/main/index.js'), './no-such-module')).toBe(false);
    expect(resolves(BUILD_OUTPUT_ENTRY, './js/no-such-module')).toBe(false);
    expect(resolves(BUILD_OUTPUT_ENTRY, './js/controller')).toBe(true);
  });
});
