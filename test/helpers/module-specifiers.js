/**
 * Collect the module specifiers a source file imports, from its AST.
 *
 * Reading them with a regex misses double-quoted specifiers, `require`, dynamic
 * `import()` and re-exports, and matches text inside comments and strings. The
 * Babel parser the build already uses sees exactly what the runtime will.
 */
const fs = require('fs');
const path = require('path');
const { parseSync, traverse } = require('@babel/core');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Every specifier in `code`, in source order, including duplicates.
 *
 * @param {string} code Source text.
 * @param {string} filename Used only so Babel picks the right syntax plugins.
 * @returns {string[]} The specifiers exactly as written.
 */
const specifiersInSource = (code, filename) => {
  const ast = parseSync(code, {
    filename,
    cwd: ROOT,
    ast: true,
    code: false,
  });
  const found = [];
  // Babel rejects a visitor that returns a value, so `collect` swallows the
  // result of `push`.
  const collect = (value) => {
    found.push(value);
  };
  traverse(ast, {
    ImportDeclaration: ({ node }) => collect(node.source.value),
    ExportNamedDeclaration: ({ node }) => {
      if (node.source) {
        collect(node.source.value);
      }
    },
    ExportAllDeclaration: ({ node }) => collect(node.source.value),
    CallExpression: ({ node }) => {
      const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';
      const isDynamicImport = node.callee.type === 'Import';
      const [first] = node.arguments;
      if ((isRequire || isDynamicImport) && first && first.type === 'StringLiteral') {
        collect(first.value);
      }
    },
  });
  return found;
};

/**
 * Every specifier in `file`, in source order, including duplicates.
 *
 * @param {string} file Absolute path to a `.js` or `.jsx` source file.
 * @returns {string[]} The specifiers exactly as written.
 */
const moduleSpecifiers = (file) => specifiersInSource(fs.readFileSync(file, 'utf8'), file);

/** Every `.js` and `.jsx` file under `dir`, recursively. */
const sourceFiles = (dir, out = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.jsx?$/.test(entry.name)) {
      out.push(full);
    }
  });
  return out;
};

module.exports = { ROOT, moduleSpecifiers, specifiersInSource, sourceFiles };
