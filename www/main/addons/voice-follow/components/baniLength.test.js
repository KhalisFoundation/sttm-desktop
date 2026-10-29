// Unit tests for baniLength.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  REHRAS_BANI,
  AARTI_BANI,
  SOHILA_BANI,
  baniLengthFor,
  readRuleMayOpen,
} = require('./baniLength');

describe('baniLengthFor', () => {
  it('follows Kirtan Sohila at the long length for a short or medium user', () => {
    assert.equal(baniLengthFor(SOHILA_BANI, 'short'), 'long');
    assert.equal(baniLengthFor(SOHILA_BANI, 'medium'), 'long');
  });
  it('never lowers a longer Sohila the user chose', () => {
    assert.equal(baniLengthFor(SOHILA_BANI, 'long'), 'long');
    assert.equal(baniLengthFor(SOHILA_BANI, 'extralong'), 'extralong');
  });
  it('still follows Rehras and Aarti at the extra-long length', () => {
    ['short', 'medium', 'long', 'extralong'].forEach((len) => {
      assert.equal(baniLengthFor(REHRAS_BANI, len), 'extralong');
      assert.equal(baniLengthFor(AARTI_BANI, len), 'extralong');
    });
  });
  it("leaves every other Bani at the user's length", () => {
    [2, 4, 9, 10, 24, 1000].forEach((b) => {
      ['short', 'medium', 'long', 'extralong'].forEach((len) => {
        assert.equal(baniLengthFor(b, len), len);
      });
    });
  });
});

describe('readRuleMayOpen', () => {
  // A short user's lists (shabad ids of the user-length Banis that Autopilot raises).
  const userShabads = {
    [REHRAS_BANI]: new Set([40, 41, 42]),
    [SOHILA_BANI]: new Set([49, 50, 51, 52, 53]),
  };
  it("lets the long Sohila's opening shabads open Sohila by the reading rule", () => {
    [2367, 3085, 820, 1958].forEach((sid) => {
      assert.equal(readRuleMayOpen(SOHILA_BANI, sid, userShabads), true);
    });
  });
  it("keeps Sohila proper's own shabads opening it as before", () => {
    [49, 50, 51, 52, 53].forEach((sid) => {
      assert.equal(readRuleMayOpen(SOHILA_BANI, sid, userShabads), true);
    });
  });
  it('lets no other added shabad open Sohila (e.g. an extra-long piece)', () => {
    [2490, 7402, 7411].forEach((sid) => {
      assert.equal(readRuleMayOpen(SOHILA_BANI, sid, userShabads), false);
    });
  });
  it("keeps Rehras's rule: its opening opens it, its closing saloks never do", () => {
    assert.equal(readRuleMayOpen(REHRAS_BANI, 1661, userShabads), true);
    assert.equal(readRuleMayOpen(REHRAS_BANI, 1721, userShabads), true);
    assert.equal(readRuleMayOpen(REHRAS_BANI, 1944, userShabads), false);
    assert.equal(readRuleMayOpen(REHRAS_BANI, 40, userShabads), true);
  });
  it('never opens Sohila from its opening shabads during Akhand Paath following', () => {
    [2367, 3085, 820, 1958].forEach((sid) => {
      assert.equal(readRuleMayOpen(SOHILA_BANI, sid, userShabads, true), false);
    });
    assert.equal(readRuleMayOpen(SOHILA_BANI, 49, userShabads, true), true);
    assert.equal(readRuleMayOpen(REHRAS_BANI, 1661, userShabads, true), false);
  });
  it('leaves a Bani the user already reads at full length, and other Banis, alone', () => {
    assert.equal(readRuleMayOpen(SOHILA_BANI, 2490, {}), true);
    assert.equal(readRuleMayOpen(2, 1, userShabads), true);
  });
});
