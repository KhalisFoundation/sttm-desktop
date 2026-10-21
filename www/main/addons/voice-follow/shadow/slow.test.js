// Slow-PC guard: the hidden run is off when the fast tier does not fit the self-test pass time.
// Run with: node --test www/main/addons/voice-follow/shadow/slow.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const pace = require('../engine/pace');

describe('pace.keepsUp (prod collector slow-PC guard)', () => {
  it('fits the fast tier at LOAD_MAX: 6 passes/s x pass seconds <= 0.8', () => {
    const limitMs = (pace.LOAD_MAX * 1000) / pace.TIERS[0].passesPerS; // 133 ms
    assert.equal(pace.keepsUp(limitMs), true);
    assert.equal(pace.keepsUp(limitMs - 1), true);
    assert.equal(pace.keepsUp(limitMs + 1), false);
  });
  it('a fast machine keeps up, a slow one does not, unknown never does', () => {
    assert.equal(pace.keepsUp(40), true);
    assert.equal(pace.keepsUp(400), false);
    assert.equal(pace.keepsUp(null), false);
  });
});
