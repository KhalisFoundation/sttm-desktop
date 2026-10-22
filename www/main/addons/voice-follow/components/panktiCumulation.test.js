// Unit tests for panktiCumulation.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULTS, shabadTotal, elapse, addHit } = require('./panktiCumulation');

const hit = (shabadId, verseId, margin = 0.3, score = 0.9) => ({
  shabadId,
  verseId,
  score,
  margin,
});

describe('Pankti Cumulation', () => {
  it('two different pangtis count much more than one pangti twice', () => {
    const a = new Map();
    addHit(a, hit(10, 100));
    const twice = addHit(a, hit(10, 100));
    const b = new Map();
    addHit(b, hit(10, 100));
    const two = addHit(b, hit(10, 105));
    assert.ok(two.total > twice.total + 0.7);
    assert.equal(twice.distinct, 1);
    assert.equal(two.distinct, 2);
  });

  it('a neighbouring pangti gets a bonus', () => {
    const near = new Map();
    addHit(near, hit(10, 100));
    const n = addHit(near, hit(10, 101));
    const far = new Map();
    addHit(far, hit(10, 100));
    const f = addHit(far, hit(10, 120));
    assert.ok(n.total > f.total);
    assert.ok(Math.abs(n.total - f.total - DEFAULTS.neighbour) < 1e-9);
  });

  it('a pangti shared by several Shabads adds about nothing', () => {
    const s = new Map();
    assert.equal(addHit(s, hit(10, 100, 0)), null); // exact tie: not counted
    const r = addHit(s, hit(10, 100, 0.06));
    assert.ok(r.total < 0.5);
  });

  it('a pause freezes the evidence, sung audio fades it', () => {
    const s = new Map();
    addHit(s, hit(10, 100));
    addHit(s, hit(10, 105));
    const before = shabadTotal(s.get(10)).total;
    for (let i = 0; i < 600; i += 1) elapse(s, 0.5, true); // 5 min of alaap / tabla / silence
    assert.equal(shabadTotal(s.get(10)).total, before);
    elapse(s, DEFAULTS.tauS, false); // tauS of singing other words
    assert.ok(Math.abs(shabadTotal(s.get(10)).total - before / Math.E) < 1e-9);
  });

  it('nothing resets on silence: the next pangti after a long pause completes the Shabad', () => {
    const s = new Map();
    const first = addHit(s, hit(10, 100));
    assert.equal(first.ready, false);
    for (let i = 0; i < 240; i += 1) elapse(s, 0.5, true); // 2 min pause
    const second = addHit(s, hit(10, 101));
    assert.equal(second.ready, true);
  });

  it('a rival Shabad with as much evidence blocks the lead', () => {
    const s = new Map();
    addHit(s, hit(20, 300));
    addHit(s, hit(20, 301));
    addHit(s, hit(10, 100));
    const r = addHit(s, hit(10, 101));
    assert.equal(r.ready, false);
    assert.ok(r.next > 0);
  });

  it('a repeated half pangti keeps its pangti alive but never counts as a new one', () => {
    const s = new Map();
    let r;
    for (let i = 0; i < 20; i += 1) r = addHit(s, hit(10, 100));
    assert.equal(r.distinct, 1);
    assert.ok(r.total <= DEFAULTS.cap);
    assert.equal(r.ready, false);
  });
});
