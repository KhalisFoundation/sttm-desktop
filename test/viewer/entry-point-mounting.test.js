/**
 * An HTML entry point that calls its component cannot support hooks.
 *
 * `www/*.html` mount React by hand, with no bundler and no JSX, so each one
 * chooses how to hand its root component to `createRoot(...).render(...)`.
 * Passing `app()` calls the component outside React's render, which leaves the
 * hook dispatcher unset: the first hook it reaches throws
 * `Cannot read properties of null (reading 'useEffect')` before the tree can
 * mount, and the window comes up blank.
 *
 * Nothing else catches this. The entry points are HTML, so no lint or unit test
 * loads them, and `www/js/` is gitignored build output, so the fault only
 * appears once someone rebuilds. A component can therefore gain a hook and the
 * whole suite stays green.
 *
 * The rule below is the weakest one that holds: an entry point may keep calling
 * its component for as long as that component uses no hooks. Add a hook and the
 * entry point has to render it as an element.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');
const { ROOT } = require('../helpers/module-specifiers');

/** Every entry point that mounts a React root. */
const ENTRY_POINTS = ['index.html', 'overlay.html', 'viewer.html'];

const parse = (code, filename) => parseSync(code, { filename, cwd: ROOT, ast: true, code: false });

/** The inline `<script>` bodies of an HTML file, concatenated. */
const inlineScripts = (html) => {
  const bodies = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    bodies.push(match[1]);
    match = pattern.exec(html);
  }
  return bodies.join('\n;\n');
};

/**
 * How an entry point mounts its root component.
 *
 * @returns {{specifier: string, binding: string, called: boolean}|null}
 */
const mountSite = (script, filename) => {
  const ast = parse(script, filename);
  const requiredAs = new Map();
  let site = null;
  const note = (key, value) => {
    requiredAs.set(key, value);
  };

  traverse(ast, {
    // `const app = require('./js/...').default`
    VariableDeclarator: ({ node }) => {
      const { init, id } = node;
      if (!init || id.type !== 'Identifier') return;
      const call =
        init.type === 'MemberExpression' && init.property.name === 'default' ? init.object : init;
      if (
        call.type === 'CallExpression' &&
        call.callee.type === 'Identifier' &&
        call.callee.name === 'require' &&
        call.arguments[0] &&
        call.arguments[0].type === 'StringLiteral'
      ) {
        note(id.name, call.arguments[0].value);
      }
    },
    CallExpression: (nodePath) => {
      const { callee, arguments: args } = nodePath.node;
      if (callee.type !== 'MemberExpression' || callee.property.name !== 'render') return;
      const [arg] = args;
      if (!arg) return;
      if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier') {
        site = { binding: arg.callee.name, called: true };
      } else {
        // `React.createElement(app)` and friends: the component is passed, not run.
        const passed = arg.type === 'CallExpression' ? arg.arguments[0] : arg;
        site = { binding: passed && passed.name, called: false };
      }
    },
  });

  return site && requiredAs.has(site.binding)
    ? { ...site, specifier: requiredAs.get(site.binding) }
    : site;
};

/** The source file a built specifier such as `./js/viewer/viewerApp.js` came from. */
const sourceFor = (specifier) => {
  const relative = specifier.replace(/^\.\/js\//, '').replace(/\.js$/, '');
  return ['jsx', 'js']
    .map((ext) => path.join(ROOT, 'www', 'main', `${relative}.${ext}`))
    .find((candidate) => fs.existsSync(candidate));
};

/** The name a call expression invokes, whether `foo()` or `obj.foo()`. */
const calleeName = ({ callee }) => {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return null;
};

/** Hooks called in the body of the module's default-exported component. */
const hooksInDefaultExport = (file) => {
  const ast = parse(fs.readFileSync(file, 'utf8'), file);
  let exported = null;
  const found = new Set();
  const collect = (name) => {
    found.add(name);
  };

  traverse(ast, {
    ExportDefaultDeclaration: ({ node }) => {
      if (node.declaration.type === 'Identifier') {
        exported = node.declaration.name;
      }
    },
  });

  traverse(ast, {
    VariableDeclarator: (declPath) => {
      const { id, init } = declPath.node;
      if (id.type !== 'Identifier' || id.name !== exported || !init) return;
      const body = declPath.get('init');
      body.traverse({
        CallExpression: (callPath) => {
          const name = calleeName(callPath.node);
          // Only hooks reached when the component itself runs; ones inside a
          // nested function run under React and are fine either way.
          if (name && /^use[A-Z]/.test(name) && callPath.getFunctionParent() === body) {
            collect(name);
          }
        },
      });
    },
  });

  return [...found];
};

describe('mounting a React root from an HTML entry point', () => {
  const mounts = ENTRY_POINTS.map((name) => {
    const file = path.join(ROOT, 'www', name);
    const site = mountSite(inlineScripts(fs.readFileSync(file, 'utf8')), file);
    const source = site && site.specifier && sourceFor(site.specifier);
    return { name, site, source, hooks: source ? hooksInDefaultExport(source) : [] };
  });

  it('finds a root component in every entry point that mounts one', () => {
    mounts.forEach(({ name, site, source }) => {
      expect([name, !!site, !!source]).toEqual([name, true, true]);
    });
  });

  it.each(ENTRY_POINTS)('%s does not call a component that uses hooks', (name) => {
    const { site, hooks } = mounts.find((m) => m.name === name);
    if (!hooks.length) return;
    expect([name, hooks, site.called]).toEqual([name, hooks, false]);
  });

  it('viewer.html renders its component as an element, because it uses hooks', () => {
    const viewer = mounts.find((m) => m.name === 'viewer.html');
    expect(viewer.hooks.length).toBeGreaterThan(0);
    expect(viewer.site.called).toBe(false);
  });

  it('an entry point that builds an element has React in scope', () => {
    ENTRY_POINTS.forEach((name) => {
      const { site } = mounts.find((m) => m.name === name);
      if (site.called) return;
      const html = fs.readFileSync(path.join(ROOT, 'www', name), 'utf8');
      expect([name, /require\(['"]react['"]\)/.test(inlineScripts(html))]).toEqual([name, true]);
    });
  });
});
