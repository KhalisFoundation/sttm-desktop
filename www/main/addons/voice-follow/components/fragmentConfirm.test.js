// Unit tests for fragmentConfirm.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { partialRatio } = require('../engine/fuzz');
const { DEFAULTS, step, elapse, of } = require('./fragmentConfirm');

// Shabad 2879 (owner's test, Oct 18) and the Shabad that was on screen (1455): pangtis exactly as
// BaniDB gives them (verse IDs 32496, 32500, 32498, 32499 and 17141-17144); spaces and dandas are skipped while comparing.
const X = {
  id: 2879,
  role: 'change',
  linesCompared: [
    'ਜੇ ਭੁਲੀ ਜੇ ਚੁਕੀ ਸਾਈਂ ਭੀ ਤਹਿੰਜੀ ਕਾਢੀਆ ॥',
    'ਸਜਣੁ ਤੂਹੈ ਸੈਣੁ ਤੂ ਮੈ ਤੁਝ ਉਪਰਿ ਬਹੁ ਮਾਣੀਆ ॥',
    'ਹਉ ਨਾ ਛੋਡਉ ਕੰਤ ਪਾਸਰਾ ॥',
    'ਸਦਾ ਰੰਗੀਲਾ ਲਾਲੁ ਪਿਆਰਾ ਏਹੁ ਮਹਿੰਜਾ ਆਸਰਾ ॥੧॥ ਰਹਾਉ ॥',
  ],
};
const CUR = {
  linesCompared: [
    'ਨਉ ਨਿਧਿ ਤੇਰੈ ਸਗਲ ਨਿਧਾਨ ॥',
    'ਇਛਾ ਪੂਰਕੁ ਰਖੈ ਨਿਦਾਨ ॥੧॥',
    'ਤੂੰ ਮੇਰੋ ਪਿਆਰੋ ਤਾ ਕੈਸੀ ਭੂਖਾ ॥',
    'ਤੂੰ ਮਨਿ ਵਸਿਆ ਲਗੈ ਨ ਦੂਖਾ ॥੧॥ ਰਹਾਉ ॥',
  ],
};
const run = (store, hyp, cands = [X]) => step(store, { hyp, cur: CUR, cands }, partialRatio);

describe('fragment confirm', () => {
  it('two different pangtis heard in short pieces confirm the Changing-to Shabad', () => {
    const s = new Map();
    const a = run(s, 'ਭਲੀਜੇਚੁਕੀ'); // piece of pangti 1
    assert.equal(a.hits.length, 1);
    assert.equal(a.ready, null);
    const b = run(s, 'ਤੁਝਉਪਰਿ'); // piece of pangti 2
    assert.deepEqual(b.ready, { id: 2879, index: 1 });
  });

  it('the same pangti heard again does not confirm', () => {
    const s = new Map();
    run(s, 'ਭਲੀਜੇਚੁਕੀ');
    const r = run(s, 'ਜੇਚੁਕੀਸਾਈ');
    assert.equal(r.ready, null);
    assert.equal(of(s, 2879).distinct, 1);
  });

  it('a Shabad lower on the board needs three different pangtis', () => {
    const s = new Map();
    const L = { ...X, role: 'list' };
    run(s, 'ਭਲੀਜੇਚੁਕੀ', [L]);
    const two = run(s, 'ਤੁਝਉਪਰਿ', [L]);
    assert.equal(two.ready, null);
    const three = run(s, 'ਛੋਡਉਕੰਤ', [L]);
    assert.deepEqual(three.ready, { id: 2879, index: 2 });
  });

  it('a piece that fits another board candidate too adds little', () => {
    const s = new Map();
    // Another board candidate holding the same pangti (a Shabad copy), as BaniDB gives it (verse 32496).
    const Y = { id: 99, role: 'list', linesCompared: ['ਜੇ ਭੁਲੀ ਜੇ ਚੁਕੀ ਸਾਈਂ ਭੀ ਤਹਿੰਜੀ ਕਾਢੀਆ ॥'] };
    const r = run(s, 'ਭਲੀਜੇਚੁਕੀ', [X, Y]);
    assert.equal(r.hits.length, 2);
    r.hits.forEach((h) => assert.equal(h.w, DEFAULTS.sharedW));
    run(s, 'ਤੁਝਉਪਰਿ', [X, Y]);
    assert.equal(of(s, 2879).total < DEFAULTS.lock, true);
  });

  it('a piece that fits the Shabad on screen adds nothing', () => {
    const s = new Map();
    // A candidate holding the on-screen Shabad's own pangti, as BaniDB gives it (verse 17143).
    const Z = { id: 7, role: 'change', linesCompared: ['ਤੂੰ ਮੇਰੋ ਪਿਆਰੋ ਤਾ ਕੈਸੀ ਭੂਖਾ ॥'] };
    const r = run(s, 'ਤੂੰਮੇਰੋਪਿਆਰੋ', [Z]);
    assert.equal(r.hits.length, 0);
  });

  it('a short piece must be found verbatim in the pangti; a longer one may differ a little', () => {
    const s = new Map();
    assert.equal(run(s, 'ਵੇਭਲੀ').hits.length, 0); // 5 letters, fits pangti 1 at 0.8 by chance
    assert.equal(run(s, 'ਤੁਝਉਪ').hits.length, 1); // 5 letters, verbatim in pangti 2
    assert.equal(run(s, 'ਭਲੀਜੇਚੁਕੀਸ').hits.length, 1); // 10 letters, one letter off
  });

  it('pieces shorter than five letters are ignored', () => {
    const s = new Map();
    assert.equal(run(s, 'ਭਲੀ').hits.length, 0);
  });

  it('a pause freezes the weights; singing fades them', () => {
    const s = new Map();
    run(s, 'ਭਲੀਜੇਚੁਕੀ');
    const before = of(s, 2879).total;
    for (let i = 0; i < 600; i += 1) elapse(s, 0.5, true);
    assert.equal(of(s, 2879).total, before);
    elapse(s, DEFAULTS.tauS, false);
    assert.ok(Math.abs(of(s, 2879).total - before / Math.E) < 1e-9);
  });
});
