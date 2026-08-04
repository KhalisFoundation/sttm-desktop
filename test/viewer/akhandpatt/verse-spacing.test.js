const fs = require('fs');
const path = require('path');

const {
  DEFAULT_LINE_SPACING,
  DEFAULT_VERSE_SPACING,
} = require('../../../www/main/common/constants');
const { ruleBody, withoutComments } = require('../../helpers/scss-rule');

const SCSS_PATH = path.join(
  __dirname,
  '../../../www/src/scss/viewer/verse-slide/_verse-slide.scss',
);

const DECK_PATH = path.join(__dirname, '../../../www/main/viewer/ShabadDeck/ShabadDeck.jsx');

const source = fs.readFileSync(SCSS_PATH, 'utf8');
const deckSource = fs.readFileSync(DECK_PATH, 'utf8');

describe('Akhand Paatth verse spacing', () => {
  // The operator scrolls the deck by what they see in the preview pane, so the
  // preview has to frame the same lines as the projection despite being a
  // fraction of its size. That only holds while every contribution to a verse's
  // height scales with the viewport. A fixed length produced 3.75 verses per
  // preview screen against 5.69 on the projection, so the declarations are
  // checked here.
  describe('the scaled-replica property', () => {
    const body = withoutComments(ruleBody(source, '.akhandpatt-view'));

    // A px literal is legitimate as an argument to the conversion helper, which
    // is the whole point of the helper: it states the reference-design size and
    // converts it. Anywhere else it is an absolute length.
    const declarationsWithoutHelperArgs = body
      .replace(/akhandpatt-vh\([^)]*\)/g, 'akhandpatt-vh()')
      .split('\n')
      .filter((line) => line.includes(':'));

    it.each(['px', 'pt', 'cm', 'in', 'mm', 'pc'])('declares no absolute length in %s', (unit) => {
      const offenders = declarationsWithoutHelperArgs.filter((line) =>
        new RegExp(`\\d\\s*${unit}\\b`).test(line),
      );
      expect(offenders).toEqual([]);
    });

    it('sizes every declared length in viewport units', () => {
      const lengths = declarationsWithoutHelperArgs.filter((line) =>
        /\d/.test(line.split(':').slice(1).join(':')),
      );
      // Only unitless numbers (line-height, z-index, opacity) and vh may remain.
      const offenders = lengths.filter(
        (line) => !/vh|akhandpatt-vh\(\)|akhandpatt-(verse|line)-spacing\(\)/.test(line),
      );
      expect(offenders).toEqual([]);
    });
  });

  // The stylesheet cannot import the JavaScript constants, so each default is
  // written twice: once as the value the store and the Spacing control work in,
  // and once as the CSS fallback. They must not drift, or a deck that somehow
  // renders before the store has set the custom properties would lay out
  // differently from one that has.
  it.each([
    ['verse', DEFAULT_VERSE_SPACING],
    ['line', DEFAULT_LINE_SPACING],
  ])('keeps the SCSS %s-spacing fallback in step with its constant', (axis, expected) => {
    const match = source.match(new RegExp(`\\$akhandpatt-default-${axis}-spacing:\\s*(\\d+)\\s*;`));
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(expected);
  });

  // Verses need more air around them than their own lines need between them, or
  // the deck reads as an undifferentiated column and the sangat cannot see where
  // one verse ends. This is why the controls use two axes.
  it('separates verses more generously than the lines within one', () => {
    expect(DEFAULT_VERSE_SPACING).toBeGreaterThan(DEFAULT_LINE_SPACING);
  });

  // The reference height is what makes a spacing value mean a fixed number of
  // pixels on the modal Gurdwara projector, which is how the defaults were
  // chosen.
  it('converts against the 1080p reference design', () => {
    expect(source).toMatch(/\$akhandpatt-design-height:\s*1080\s*;/);
    expect(source).toMatch(
      /var\(--akhandpatt-verse-spacing[^)]*\)\s*\/\s*#\{\$akhandpatt-design-height\}/,
    );
    expect(source).toMatch(
      /var\(--akhandpatt-line-spacing[^)]*\)\s*\/\s*#\{\$akhandpatt-design-height\}/,
    );
  });

  // The two spacings cross from JavaScript into CSS through custom properties,
  // which neither language checks across files. Renaming the property on either
  // side leaves both files valid and makes the deck fall back to the defaults.
  // The test compares the property names on both sides.
  it.each(['--akhandpatt-verse-spacing', '--akhandpatt-line-spacing'])(
    'writes %s in the deck and reads it in the stylesheet',
    (property) => {
      expect(deckSource).toContain(`'${property}'`);
      expect(source).toContain(`var(${property}`);
    },
  );
});
