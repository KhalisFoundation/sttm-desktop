// Akhand Paath: a pangti read again from its top must not move the screen to the next pangti
// (engine/follower2 restarted()). Run: node --test <this file>
// The lines are made-up letter strings (not Gurbani): only their letters matter here.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FollowerV2 } = require('../engine/follower2');

// The next pangti opens with letters close to the current one's opening (one letter apart).
const LINES = [
  { verseId: 1, text: 'ਕਖਗ ਘਙਚ ਛਜਝ ਞਟਠ' },
  { verseId: 2, text: 'ਕਥਗ ਤਥਦ ਧਨਪ ਫਬਭ' },
  { verseId: 3, text: 'ਮਯਰ ਲਵੜ ਸਹਕ ਖਗਘ' },
];
const NEXT_SAME_START = [
  { verseId: 1, text: 'ਕਖਗ ਘਙਚ ਛਜਝ ਞਟਠ' },
  { verseId: 2, text: 'ਕਖਗ ਘਙਚ ਧਨਪ ਫਬਭ' },
  { verseId: 3, text: 'ਮਯਰ ਲਵੜ ਸਹਕ ਖਗਘ' },
];
const letters = (s) => [...s.replace(/\s+/g, '')];
const at = (lines, line, opts = {}) => {
  const f = new FollowerV2({}, lines, { akhand: true, ...opts });
  f.seek(line);
  return f;
};

describe('Akhand Paath: a pangti read again from its top', () => {
  it('stays on the pangti when its opening words are read again', () => {
    const f = at(LINES, 0);
    // the end of pangti 1, then its first word again
    const out = f.decide(letters('ਛਜਝ ਞਟਠ ਕਖਗ'));
    assert.equal(out.lineIndex, 0);
    assert.equal(f.cur, 0);
  });
  it('moves on when the next pangti really begins', () => {
    const f = at(LINES, 0);
    const out = f.decide(letters('ਛਜਝ ਞਟਠ ਕਥਗ'));
    assert.equal(out.lineIndex, 1);
    assert.equal(f.cur, 1);
  });
  it('two pangtis that open alike: moves on as before (no added wait)', () => {
    const f = at(NEXT_SAME_START, 0);
    assert.equal(f.decide(letters('ਛਜਝ ਞਟਠ ਕਖਗ')).lineIndex, 1);
  });
  it('a repeat is followed through: the pangti is read again, then the next one starts', () => {
    const f = at(LINES, 0);
    assert.equal(f.decide(letters('ਛਜਝ ਞਟਠ ਕਖਗ')).lineIndex, 0);
    assert.equal(f.decide(letters('ਞਟਠ ਕਖਗ ਘਙਚ ਛਜਝ')).lineIndex, 0);
    assert.equal(f.decide(letters('ਛਜਝ ਞਟਠ ਕਥਗ ਤਥਦ')).lineIndex, 1);
  });
  it('leaves other followers as they were', () => {
    const f = at(LINES, 0, { akhand: false });
    // the Bani (paath) follower keeps its own rule: no restart check, so it moves on as before
    assert.equal(f.decide(letters('ਛਜਝ ਞਟਠ ਕਖਗ')).lineIndex, 1);
  });
});
