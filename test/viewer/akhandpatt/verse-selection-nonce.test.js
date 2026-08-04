/**
 * Guards the chain that carries a verse selection from the navigator to the
 * deck: a field in a config, a setter call in each place a line is opened, and a
 * prop on the hook.
 *
 * `selection-intent.test.js` covers what the nonce does once it arrives, but it
 * drives the hook directly and supplies those props itself, so none of the links
 * below are visible to it. Rendering `ShabadText` instead would mean standing up
 * `react-virtuoso`, `ipcRenderer` and the whole navigator store, and the result
 * would assert little more than these do while adding mocks that can drift from
 * the real thing.
 *
 * So the first check reads a real config file, and the rest read the AST of the
 * real source. They are wiring checks, not behavioural ones, and are written
 * against structure rather than text so that reformatting cannot break them.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');
const { ROOT } = require('../../helpers/module-specifiers');

const WWW = path.join(ROOT, 'www');
const read = (...segments) => fs.readFileSync(path.join(WWW, ...segments), 'utf8');

const navigatorSettings = JSON.parse(read('configs', 'navigator-settings.json'));

const astOf = (...segments) => {
  const file = path.join(WWW, ...segments);
  return parseSync(fs.readFileSync(file, 'utf8'), { filename: file, cwd: ROOT, ast: true });
};

const isCallTo = (node, name) =>
  node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === name;

/** The names called by the function that calls `name`, or an empty array. */
const siblingCalls = (ast, name) => {
  let siblings = [];
  traverse(ast, {
    CallExpression: (callPath) => {
      if (!isCallTo(callPath.node, name)) {
        return;
      }
      const fn = callPath.getFunctionParent();
      const found = [];
      fn.traverse({
        CallExpression: ({ node }) => {
          if (node.callee.type === 'Identifier') {
            found.push(node.callee.name);
          }
        },
      });
      siblings = found;
    },
  });
  return siblings;
};

/** The property names of the object literal passed to `name`. */
const argumentKeys = (ast, name) => {
  let keys = [];
  traverse(ast, {
    CallExpression: ({ node }) => {
      if (!isCallTo(node, name)) {
        return;
      }
      const [first] = node.arguments;
      if (first && first.type === 'ObjectExpression') {
        keys = first.properties.filter((p) => p.key).map((p) => p.key.name);
      }
    },
  });
  return keys;
};

describe('verse selection nonce', () => {
  it('is declared in the navigator schema, which is what syncs it to the viewer', () => {
    // The store builds its state and cross-window setters from this file. A field
    // missing here does not reach the presenter window.
    expect(navigatorSettings).toHaveProperty('verseSelectionNonce');
    expect(typeof navigatorSettings.verseSelectionNonce).toBe('number');
  });

  it('is advanced in the same handler that moves the reader to a line', () => {
    // Present but in the wrong function would not be a selection, so this checks
    // the two calls share an enclosing function rather than merely a file.
    const shabadText = astOf('main', 'navigator', 'shabad', 'ShabadText.jsx');
    expect(siblingCalls(shabadText, 'changeVerse')).toContain('setVerseSelectionNonce');
  });

  it('is advanced when a line is reopened from history', () => {
    const history = astOf('main', 'navigator', 'misc', 'components', 'HistoryPane.jsx');
    expect(siblingCalls(history, 'setVerseSelectionNonce')).toContain('setPane1');
  });

  it('is handed to the scroll hook', () => {
    const deck = astOf('main', 'viewer', 'ShabadDeck', 'ShabadDeck.jsx');
    expect(argumentKeys(deck, 'useAkhandpattScroll')).toContain('verseSelectionNonce');
  });
});
