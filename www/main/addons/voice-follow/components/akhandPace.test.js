// Akhand Paath listening schedule (engine/pace): only when flagged, scoped and in the fast
// tier; every other mode keeps the tier's own schedule. Run: node --test <this file>
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const pace = require('../engine/pace');

describe('pace Akhand Paath schedule', () => {
  afterEach(() => {
    pace.setAkhand(false);
    pace.setScoped(false);
  });
  it('changes nothing unless Akhand Paath is flagged', () => {
    pace.setScoped(true);
    assert.equal(pace.hopS('akhand', 0.25), 0.25);
    assert.equal(pace.windowS('akhand', 4), 4);
    assert.equal(pace.hopS('recognizer', 0.5), 0.5);
    assert.equal(pace.hopS('follower', 0.25), 0.25);
  });
  it('listens twice as often on a shorter window, the recognizer half as often', () => {
    pace.setScoped(true);
    pace.setAkhand(true);
    assert.equal(pace.hopS('akhand', 0.25), 0.125);
    assert.equal(pace.windowS('akhand', 4), 2.5);
    assert.equal(pace.hopS('recognizer', 0.5), 1);
    // other followers and texts are untouched
    assert.equal(pace.hopS('follower', 0.25), 0.25);
    assert.equal(pace.windowS('paath', 4), 4);
  });
  it('keeps the same model work as the fast tier', () => {
    const { AKHAND } = pace;
    const work = ((1 / AKHAND.followerHopS) * AKHAND.windowS) / 4 + 1 / AKHAND.recognizerHopS;
    assert.ok(work <= 6, `akhand passes/s (4 s equivalent) ${work}`);
  });
  it('is off when nothing read is being followed', () => {
    pace.setAkhand(true);
    pace.setScoped(false);
    assert.equal(pace.hopS('akhand', 0.25), 0.25);
    assert.equal(pace.hopS('recognizer', 0.5), 0.5);
  });
});
