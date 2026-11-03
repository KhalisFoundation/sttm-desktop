// Unit tests for sevadaarHint.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { distinctShabads, rankHint, decideHint, openAt } = require('./sevadaarHint');

const rows = [
  { shabadId: 1, verseId: 10, verse: 'a' },
  { shabadId: 1, verseId: 11, verse: 'b' },
  { shabadId: 2, verseId: 20, verse: 'c' },
  { shabadId: 3, verseId: 30, verse: 'd' },
];

describe('sevadaarHint', () => {
  it('keeps one row per Shabad, in the database order', () => {
    assert.deepEqual(
      distinctShabads(rows).map((r) => r.verseId),
      [10, 20, 30],
    );
    assert.equal(distinctShabads(rows, 2).length, 2);
  });
  it('ranks by what is heard, ties keep the database order', () => {
    const s = { 1: 0.3, 2: 0.8, 3: 0.3 };
    const r = rankHint(distinctShabads(rows), (id) => ({ s: s[id], index: 0 }));
    assert.deepEqual(
      r.map((x) => x.shabadId),
      [2, 1, 3],
    );
  });
  it('opens a single match at once, and among several only on a clear hearing', () => {
    const one = rankHint([rows[0]], () => ({ s: 0, index: -1 }));
    assert.equal(decideHint(one).reason, 'only');
    const close = rankHint(distinctShabads(rows), (id) => ({ s: { 1: 0.7, 2: 0.65, 3: 0 }[id] }));
    assert.equal(decideHint(close), null);
    const clear = rankHint(distinctShabads(rows), (id) => ({ s: { 1: 0.8, 2: 0.5, 3: 0 }[id] }));
    assert.deepEqual([decideHint(clear).pick.shabadId, decideHint(clear).reason], [1, 'heard']);
    const weak = rankHint(distinctShabads(rows), (id) => ({ s: { 1: 0.5, 2: 0.1, 3: 0 }[id] }));
    assert.equal(decideHint(weak), null);
  });
  it('never picks a mid-pangti match by itself; those stay listed to tap', () => {
    const any = [
      { shabadId: 1, verseId: 10, kind: 'any' },
      { shabadId: 2, verseId: 20, kind: 'any' },
    ];
    assert.equal(decideHint(rankHint([any[0]], () => ({ s: 0.95 }))), null);
    assert.equal(decideHint(rankHint(any, (id) => ({ s: { 1: 0.95, 2: 0.1 }[id] }))), null);
    const mixed = [{ shabadId: 3, verseId: 30, kind: 'start' }, ...any];
    assert.equal(
      decideHint(rankHint(mixed, (id) => ({ s: { 1: 0.95, 2: 0.1, 3: 0.2 }[id] }))).pick.shabadId,
      3,
    );
  });
  it('opens at the heard pangti when clear, else at the typed one', () => {
    assert.deepEqual(openAt({ s: 0.9, index: 2, verseId: 10 }, [10, 11, 12]), {
      verseId: 12,
      heard: true,
    });
    assert.deepEqual(openAt({ s: 0.4, index: 2, verseId: 10 }, [10, 11, 12]), {
      verseId: 10,
      heard: false,
    });
  });
});
