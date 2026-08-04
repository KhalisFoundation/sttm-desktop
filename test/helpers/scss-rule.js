/**
 * Minimal SCSS reading for tests that assert properties of a stylesheet rule.
 * Not a parser: it finds one rule by the text of its selector and returns the
 * body, which is all any assertion here needs.
 */

/** Strip `//` line comments so prose about pixels isn't mistaken for code. */
const withoutComments = (text) => text.replace(/^\s*\/\/.*$/gm, '');

/** Extract a rule's body by brace matching. Works for nested `&` selectors. */
const ruleBody = (text, selector) => {
  const start = text.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector ${selector} not found`);
  }
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(text.indexOf('{', start) + 1, i);
      }
    }
  }
  throw new Error(`unbalanced braces in ${selector}`);
};

/** The property names declared directly in a rule body, in source order. */
const declaredProperties = (body) =>
  withoutComments(body)
    .split('\n')
    .map((line) => line.match(/^\s*([a-z-]+)\s*:/))
    .filter(Boolean)
    .map((match) => match[1]);

module.exports = { declaredProperties, ruleBody, withoutComments };
