// Unit tests for shabadEvidence.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createEvidence } = require('./shabadEvidence');

const hit = (shabadId, verseId, score) => ({ shabadId, verseId, line: `p${verseId}`, score });

describe('shabadEvidence', () => {
  it('builds up per distinct pangti; a clear hit is a full chip, a weak one half', () => {
    const e = createEvidence();
    e.add({ now: 0, cur: 1, sCur: 0.3, cands: [hit(7, 70, 0.8)] });
    let ev = e.of(7, 0);
    assert.equal(ev.distinct, 1);
    assert.equal(ev.pangtis[0].clear, true);
    e.add({ now: 500, cur: 1, sCur: 0.3, cands: [hit(7, 71, 0.55)] });
    ev = e.of(7, 500);
    assert.equal(ev.distinct, 2);
    assert.equal(ev.pangtis[1].clear, false);
    assert.ok(ev.fill < 1);
    e.add({ now: 1000, cur: 1, sCur: 0.3, cands: [hit(7, 72, 0.8)] });
    e.add({ now: 1500, cur: 1, sCur: 0.3, cands: [hit(7, 73, 0.8)] });
    assert.ok(e.of(7, 1500).fill >= 1, 'three clear pangtis and a weak one cross the switch line');
  });

  it('one pangti repeated never crosses the line', () => {
    const e = createEvidence();
    for (let t = 0; t < 20000; t += 500)
      e.add({ now: t, cur: 1, sCur: 0.2, cands: [hit(7, 70, 0.9)] });
    const ev = e.of(7, 20000);
    assert.equal(ev.distinct, 1);
    assert.ok(ev.fill <= 0.95);
  });

  it('fades over tens of seconds, not seconds', () => {
    const e = createEvidence();
    e.add({ now: 0, cur: 1, sCur: 0.3, cands: [hit(7, 70, 0.8), hit(7, 71, 0.8)] });
    assert.equal(e.snapshot(10000).length, 1, 'still there after 10 s');
    assert.equal(e.snapshot(30000).length, 1, 'still there after 30 s');
    assert.equal(e.snapshot(120000).length, 0, 'gone after 2 min');
  });

  it('ignores the Shabad on screen and drops one put on screen', () => {
    const e = createEvidence();
    e.add({ now: 0, cur: 1, sCur: 0.3, cands: [hit(1, 10, 0.9), hit(7, 70, 0.9)] });
    assert.equal(e.of(1, 0), null);
    e.drop(7);
    assert.equal(e.snapshot(0).length, 0);
  });
});
