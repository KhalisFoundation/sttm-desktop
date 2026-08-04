const fs = require('fs');
const path = require('path');

const { declaredProperties, ruleBody } = require('../../helpers/scss-rule');

const DECK_SCSS_PATH = path.join(
  __dirname,
  '../../../www/src/scss/viewer/shabad-deck/_shabad-deck.scss',
);

const VIEWER_SCSS_PATH = path.join(__dirname, '../../../www/src/scss/viewer/_viewer.scss');

const deckSource = fs.readFileSync(DECK_SCSS_PATH, 'utf8');
const viewerSource = fs.readFileSync(VIEWER_SCSS_PATH, 'utf8');

// Each entry is a reviewed claim that toggling this property cannot produce a
// visible animation, and why. Anything not listed has not been reviewed.
const CANNOT_ANIMATE_VISIBLY = {
  'background-attachment': 'discrete: CSS defines no interpolation for it',
  'background-size': 'declared identically on the base rule, so nothing changes',
  'overflow-anchor': 'discrete: CSS defines no interpolation for it',
  'overflow-y': 'discrete: CSS defines no interpolation for it',
  position: 'discrete: CSS defines no interpolation for it',
  width: 'the deck is a normal-flow block filling its container in both views',
};

describe('switching into and out of Akhand Paatth view', () => {
  // `.shabad-deck` is the one element that survives the switch and changes
  // class. Everything else in the deck is unmounted and rebuilt, so a fresh
  // element has no previous computed style to transition from.
  const body = ruleBody(deckSource, '&.akhandpatt-view');

  // A blanket `transition` on every descendant of the viewer means the class
  // toggle animates any property whose value differs between the two views,
  // rather than applying it. That cost a release: `padding-bottom: 10px` here
  // made the misc slide's centred text drift 5px downwards over 200ms when it
  // replaced a reading, which reads as the slide sliding into place. The rule
  // is used for theme changes, so this rule must declare only properties that
  // cannot animate visibly.
  it('declares nothing on the deck that the viewer-wide transition can animate', () => {
    const unreviewed = declaredProperties(body).filter(
      (property) => !(property in CANNOT_ANIMATE_VISIBLY),
    );
    expect(unreviewed).toEqual([]);
  });

  // This records the dependency on the viewer-wide transition; without that
  // transition, the property constraint above no longer applies.
  it('is constrained by a blanket transition it does not control', () => {
    expect(ruleBody(viewerSource, '#viewer-container')).toMatch(/\*\s*{[^}]*transition:/);
  });
});
