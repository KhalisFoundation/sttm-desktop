// Akhand Paath listening schedule (engine/pace): only when flagged and a read text is being
// followed; every other mode keeps the tier's own schedule. Run: node --test <this file>
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const pace = require('../engine/pace');

const passes = (ms) => {
  for (let i = 0; i < 5; i += 1) pace.notePass(ms, 4 * 16000);
};

describe('pace Akhand Paath schedule', () => {
  afterEach(() => {
    pace.setAkhand(false);
    pace.setScoped(false);
  });
  it('changes nothing unless Akhand Paath is flagged', () => {
    pace.setScoped(true);
    passes(40);
    assert.equal(pace.hopS('akhand', 0.125), 0.25);
    assert.equal(pace.windowS('akhand', 4), 4);
    assert.equal(pace.hopS('recognizer', 0.5), 0.5);
    assert.equal(pace.hopS('follower', 0.25), 0.25);
  });
  it('fast computer: reading follower every 0.125 s, recognizer once a second', () => {
    pace.setScoped(true);
    pace.setAkhand(true);
    passes(40); // 9 passes/s x 40 ms = 0.36 load
    assert.equal(pace.hopS('akhand', 0.125), 0.125);
    assert.equal(pace.windowS('akhand', 4), 4);
    assert.equal(pace.hopS('recognizer', 0.5), 1);
    assert.equal(pace.hopS('follower', 0.25), 0.25); // other followers untouched
  });
  it('busy computer: tier step for the follower, still a slower recognizer', () => {
    pace.setScoped(true);
    pace.setAkhand(true);
    passes(150); // 9 x 150 ms = 1.35 load: no room
    assert.equal(pace.hopS('akhand', 0.125), 0.25);
    assert.equal(pace.hopS('recognizer', 0.5), 1);
  });
  it('is off when nothing read is being followed', () => {
    pace.setAkhand(true);
    pace.setScoped(false);
    passes(40);
    assert.equal(pace.hopS('akhand', 0.125), 0.25);
    assert.equal(pace.hopS('recognizer', 0.5), 0.5);
  });
});
