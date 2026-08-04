/**
 * The translation menu is derived from the verse at the top of the deck. Under
 * a continuous reading the array holding that verse is replaced thousands of
 * times, so the derivation has to be cheap and has to give an equal answer for
 * equal inputs; otherwise every window mutation writes to the navigator store
 * in both windows.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');
const { filterBaniOptions } = require('../../www/main/viewer/ShabadDeck/bani-options');
const { BASE_BANI_OPTIONS } = require('../../www/main/banidb/constants');

const verseWith = (translations) => ({ Translations: JSON.stringify(translations) });

const idsIn = (groups) => groups.flatMap((group) => group.options.map((option) => option.id));

const FULL = {
  pu: { bdb: ['a teeka'] },
  en: { bdb: ['a translation'] },
  hi: { ss: ['a translation'] },
  es: { sn: ['una traduccion'] },
};

describe('filterBaniOptions', () => {
  it('offers everything when the verse has every translation', () => {
    expect(idsIn(filterBaniOptions(verseWith(FULL), 'bdb', 'bdb'))).toEqual([
      'teeka-punjabi',
      'translation-english',
      'translation-hindi',
      'translation-spanish',
      'transliteration-english',
      'transliteration-hindi',
    ]);
  });

  it('offers the full menu when there is no verse yet', () => {
    expect(filterBaniOptions(undefined, 'bdb', 'bdb')).toBe(BASE_BANI_OPTIONS);
  });

  it('offers the full menu rather than nothing when the translations are unreadable', () => {
    expect(filterBaniOptions({ Translations: '{not json' }, 'bdb', 'bdb')).toBe(BASE_BANI_OPTIONS);
    expect(filterBaniOptions({}, 'bdb', 'bdb')).toBe(BASE_BANI_OPTIONS);
  });

  it('drops a translation the verse does not have', () => {
    const verse = verseWith({ ...FULL, hi: {}, es: {} });
    const ids = idsIn(filterBaniOptions(verse, 'bdb', 'bdb'));
    expect(ids).not.toContain('translation-hindi');
    expect(ids).not.toContain('translation-spanish');
    expect(ids).toContain('translation-english');
  });

  it('drops a translation whose selected source is empty', () => {
    const verse = verseWith({ ...FULL, en: { bdb: [], ms: ['another'] } });
    expect(idsIn(filterBaniOptions(verse, 'bdb', 'bdb'))).not.toContain('translation-english');
    expect(idsIn(filterBaniOptions(verse, 'bdb', 'ms'))).toContain('translation-english');
  });

  it('drops a group left with no options rather than showing an empty heading', () => {
    const verse = verseWith({ ...FULL, pu: {} });
    const labels = filterBaniOptions(verse, 'bdb', 'bdb').map((group) => group.label);
    expect(labels).not.toContain('teeka');
    expect(labels).toEqual(['translation', 'transliteration']);
  });

  it('always offers transliteration, which is generated rather than stored', () => {
    const verse = verseWith({});
    expect(filterBaniOptions(verse, 'bdb', 'bdb').map((group) => group.label)).toEqual([
      'transliteration',
    ]);
  });

  // The point of the extraction: the deck compares the serialised result to
  // decide whether the navigator needs telling. That only works if two verses
  // with the same translations produce an equal answer.
  it('gives an equal answer for two different verses with the same translations', () => {
    const first = filterBaniOptions(verseWith(FULL), 'bdb', 'bdb');
    const second = filterBaniOptions(verseWith(FULL), 'bdb', 'bdb');
    expect(first).not.toBe(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('gives a different answer when a source setting changes', () => {
    const verse = verseWith({ ...FULL, pu: { bdb: ['a teeka'], ft: [] } });
    expect(JSON.stringify(filterBaniOptions(verse, 'bdb', 'bdb'))).not.toBe(
      JSON.stringify(filterBaniOptions(verse, 'ft', 'bdb')),
    );
  });

  it('never mutates the shared base list', () => {
    const before = JSON.stringify(BASE_BANI_OPTIONS);
    filterBaniOptions(verseWith({}), 'bdb', 'bdb');
    expect(JSON.stringify(BASE_BANI_OPTIONS)).toBe(before);
  });
});

describe('the deck only recomputes the menu when its inputs change', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'www', 'main', 'viewer', 'ShabadDeck', 'ShabadDeck.jsx'),
    'utf8',
  );

  it('keys the menu on the first verse, not on the array holding it', () => {
    const memo = source.match(/const baniOptions = useMemo\([\s\S]*?\n {2}\);/);
    expect(memo).not.toBeNull();
    expect(memo[0]).toContain('[baniOptionsVerse, teekaSource, translationEnglishSource]');
    expect(memo[0]).not.toMatch(/\bactiveVerse\b/);
  });

  it('does not tell the navigator when the menu is unchanged', () => {
    const effect = source.match(
      /const serialised = JSON\.stringify\(baniOptions\);[\s\S]*?\n {2}\}/,
    );
    expect(effect).not.toBeNull();
    expect(effect[0]).toMatch(/if \(serialised === lastBaniOptionsRef\.current\) \{\s*return;/);
  });
});

describe('viewer IPC listeners are cleaned up', () => {
  // A listener registered in a render body is added again on every render and
  // never removed. The viewer window stays open for the length of a reading,
  // so anything that re-renders its tree accumulates handlers for hours.
  // Registration at module scope is fine: that runs once when the window loads.
  const viewerFiles = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.jsx?$/.test(entry.name)) {
        viewerFiles.push(full);
      }
    });
  };
  walk(path.join(__dirname, '..', '..', 'www', 'main', 'viewer'));

  const calleeName = (node) => node.callee?.name ?? node.callee?.property?.name ?? '';

  const isListenerRegistration = (node) =>
    node.callee?.type === 'MemberExpression' &&
    node.callee.property?.name === 'on' &&
    /^(ipcRenderer|ipc)$/.test(
      node.callee.object?.name ?? node.callee.object?.property?.name ?? '',
    );

  const registrationsInARenderBody = (file) => {
    const ast = parseSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      configFile: false,
      presets: [require.resolve('@babel/preset-react')],
    });
    const offenders = [];
    traverse(ast, {
      CallExpression(nodePath) {
        if (!isListenerRegistration(nodePath.node) || !nodePath.getFunctionParent()) {
          return;
        }
        const insideHook = nodePath.findParent(
          (parent) => parent.isCallExpression() && /^use[A-Z]/.test(calleeName(parent.node)),
        );
        if (!insideHook) {
          offenders.push(`${path.basename(file)}:${nodePath.node.loc.start.line}`);
        }
      },
    });
    return offenders;
  };

  it('registers no listener inside a component without a hook to clean it up', () => {
    expect(viewerFiles.flatMap(registrationsInARenderBody)).toEqual([]);
  });

  it('would notice a listener moved back into a render body', () => {
    const contrived = path.join(__dirname, '..', '..', 'www', 'main', 'viewer', '__probe.jsx');
    fs.writeFileSync(
      contrived,
      'const C = () => {\nipcRenderer.on("x", () => {});\nreturn null;\n};\n',
    );
    try {
      expect(registrationsInARenderBody(contrived)).toEqual(['__probe.jsx:2']);
    } finally {
      fs.unlinkSync(contrived);
    }
  });
});
