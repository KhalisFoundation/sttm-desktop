/**
 * Guards the store layer against an easy-peasy `action()` returning its Immer
 * draft.
 *
 * easy-peasy's `simpleProduce` (see easy-peasy/dist/index.cjs.js) does, for any
 * action nested under a slice key:
 *
 *     const parent  = get(parentPath, state);   // the PREVIOUS committed state
 *     const current = get(path, draft);
 *     const result  = fn(current);
 *     if (result) parent[last] = result;        // stores a live draft on it
 *     return finishDraft(draft);                // ...which is then revoked
 *
 * So returning the draft plants a revoked proxy in the committed state tree. The
 * next dispatch throws `Cannot perform 'get' on a proxy that has been revoked`.
 * Store-driven controls stop while non-React handlers (the viewer's native wheel
 * listener) keep working, making this resemble a rendering failure.
 *
 * Actions must mutate the draft and return nothing. The resulting failure is
 * delayed until the next dispatch, so this checks action bodies directly.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');
const { ROOT, sourceFiles } = require('../helpers/module-specifiers');

const MAIN_DIR = path.join(ROOT, 'www', 'main');

const FUNCTION_TYPES = ['ArrowFunctionExpression', 'FunctionExpression'];

/**
 * Every `action()` callback in `code` that returns a value.
 *
 * A concise arrow body (`action((state) => state)`) returns by definition, which
 * is the shortest way to write the defect. Returns inside a nested function
 * belong to that function, not to the action, so they are left alone.
 *
 * @param {string} code Source text.
 * @param {string} filename Used only so Babel picks the right syntax plugins.
 * @returns {Array<{line: number, returned: string}>}
 */
const returningActions = (code, filename) => {
  const ast = parseSync(code, { filename, cwd: ROOT, ast: true, code: false });
  const offenders = [];
  const text = (node) => code.slice(node.start, node.end).replace(/\s+/g, ' ').trim();

  traverse(ast, {
    CallExpression: (callPath) => {
      const { callee, arguments: args } = callPath.node;
      if (callee.type !== 'Identifier' || callee.name !== 'action') {
        return;
      }
      const [callback] = args;
      if (!callback || !FUNCTION_TYPES.includes(callback.type)) {
        return;
      }
      if (callback.body.type !== 'BlockStatement') {
        offenders.push({ line: callback.body.loc.start.line, returned: text(callback.body) });
        return;
      }
      callPath.get('arguments.0').traverse({
        ReturnStatement: (returnPath) => {
          if (!returnPath.node.argument) {
            return;
          }
          if (returnPath.getFunctionParent().node !== callback) {
            return;
          }
          offenders.push({
            line: returnPath.node.loc.start.line,
            returned: text(returnPath.node.argument),
          });
        },
      });
    },
  });

  return offenders;
};

describe('easy-peasy actions must not return their draft', () => {
  const storeFiles = sourceFiles(MAIN_DIR).filter((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return source.includes('easy-peasy') && source.includes('action(');
  });

  it('finds the store files to check', () => {
    expect(storeFiles.length).toBeGreaterThan(0);
  });

  it('reports the ways an action can return, and only those', () => {
    const code = [
      'const a = action((state) => state);',
      'const b = action((state) => { state.x = 1; });',
      'const c = action((state) => { state.x = 1; return; });',
      'const d = action((state) => { return state; });',
      'const e = action(function (state) { return state.slice; });',
      'const f = action((state) => { state.list.forEach((i) => { return i; }); });',
      'const g = thunk((state) => state);',
      'export default [a, b, c, d, e, f, g];',
    ].join('\n');

    expect(returningActions(code, 'sample.js')).toEqual([
      { line: 1, returned: 'state' },
      { line: 4, returned: 'state' },
      { line: 5, returned: 'state.slice' },
    ]);
  });

  it.each(storeFiles.map((file) => [path.relative(MAIN_DIR, file), file]))(
    '%s returns nothing from every action',
    (_relative, file) => {
      const offenders = returningActions(fs.readFileSync(file, 'utf8'), file).map(
        ({ line, returned }) => `line ${line}: return ${returned}`,
      );

      expect(offenders).toEqual([]);
    },
  );
});
