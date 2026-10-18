// Unit tests for fragmentConfirm.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { partialRatio } = require('../engine/fuzz');
const { DEFAULTS, step, elapse, of } = require('./fragmentConfirm');

// Shabad 2879 (owner's test, Oct 18) and the Shabad that was on screen (1455), normalized.
const X = {
  id: 2879,
  role: 'change',
  linesNorm: [
    'ਜੇਭੁਲੀਜੇਚੁਕੀਸਾਈਂਭੀਤਹਿੰਜੀਕਾਢੀਆ',
    'ਜਿਨੑਾਨੇਹੁਦੂਜਾਣੇਲਗਾਝੂਰਿਮਰਹੁਸੇਵਾਢੀਆ',
    'ਹਉਨਾਛੋਡਉਕੰਤਪਾਸਰਾ',
    'ਸਦਾਰੰਗੀਲਾਲਾਲੁਪਿਆਰਾਏਹੁਮਹਿੰਜਾਆਸਰਾ',
  ],
};
const CUR = {
  linesNorm: [
    'ਨਉਨਿਧਿਤੇਰੈਸਗਲਨਿਧਾਨ',
    'ਇਛਾਪੂਰਕੁਰਖੈਨਿਦਾਨ',
    'ਤੂੰਮੇਰੋਪਿਆਰੋਤਾਕੈਸੀਭੂਖਾ',
    'ਤੂੰਮਨਿਵਸਿਆਲਗੈਨਦੂਖਾ',
  ],
};
const run = (store, hyp, cands = [X]) => step(store, { hyp, cur: CUR, cands }, partialRatio);

describe('fragment confirm', () => {
  it('two different pangtis heard in short pieces confirm the Changing-to Shabad', () => {
    const s = new Map();
    const a = run(s, 'ਭਲੀਜੇਚੁਕੀ'); // piece of pangti 1
    assert.equal(a.hits.length, 1);
    assert.equal(a.ready, null);
    const b = run(s, 'ਦੂਜਾਣੇ'); // piece of pangti 2
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
    const two = run(s, 'ਦੂਜਾਣੇ', [L]);
    assert.equal(two.ready, null);
    const three = run(s, 'ਛੋਡਉਕੰਤ', [L]);
    assert.deepEqual(three.ready, { id: 2879, index: 2 });
  });

  it('a piece that fits another board candidate too adds little', () => {
    const s = new Map();
    const Y = { id: 99, role: 'list', linesNorm: ['ਕੋਈਜੇਭੁਲੀਜੇਚੁਕੀਸਾਈਂਹੋਰ'] };
    const r = run(s, 'ਭਲੀਜੇਚੁਕੀ', [X, Y]);
    assert.equal(r.hits.length, 2);
    r.hits.forEach((h) => assert.equal(h.w, DEFAULTS.sharedW));
    run(s, 'ਦੂਜਾਣੇ', [X, Y]);
    assert.equal(of(s, 2879).total < DEFAULTS.lock, true);
  });

  it('a piece that fits the Shabad on screen adds nothing', () => {
    const s = new Map();
    const Z = { id: 7, role: 'change', linesNorm: ['ਤੂੰਮੇਰੋਪਿਆਰੋਹੋਰਕੁਝ'] };
    const r = run(s, 'ਤੂੰਮੇਰੋਪਿਆਰੋ', [Z]);
    assert.equal(r.hits.length, 0);
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
