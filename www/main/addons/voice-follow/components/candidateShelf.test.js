// Unit tests for candidateShelf.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createShelf } = require('./candidateShelf');

const c = (shabadId, pct, at) => ({ shabadId, pct, at, line: `line ${shabadId}` });
const ids = (list) => list.map((x) => x.shabadId);

describe('candidateShelf', () => {
  it('keeps a card about 8 s after its last score, fading for the last 3 s', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000)], current: 1, heardAt: 1000 });
    // the board dropped it (no more scores): still listed, not fading yet
    let out = s.update({ now: 5000, items: [], current: 1, heardAt: 5000 });
    assert.deepEqual(ids(out), [7]);
    assert.equal(out[0].fading, false);
    out = s.update({ now: 7000, items: [], current: 1, heardAt: 7000 });
    assert.deepEqual(ids(out), [7]);
    assert.equal(out[0].fading, true);
    assert.ok(out[0].pct > 0.15 && out[0].pct < 0.3, 'keeps its last %, decaying slowly');
    out = s.update({ now: 9100, items: [], current: 1, heardAt: 9100 });
    assert.deepEqual(ids(out), []);
  });

  it('a frozen board item (no new score) still ages out', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000)], current: 1, heardAt: 1000 });
    const out = s.update({ now: 9500, items: [c(7, 0.3, 1000)], current: 1, heardAt: 9500 });
    assert.deepEqual(ids(out), []);
  });

  it('a fresh score keeps it on and not fading', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000)], current: 1, heardAt: 1000 });
    const out = s.update({ now: 8000, items: [c(7, 0.2, 7900)], current: 1, heardAt: 8000 });
    assert.deepEqual(ids(out), [7]);
    assert.equal(out[0].fading, false);
  });

  it('clears when the Shabad on screen changes', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000)], current: 1, heardAt: 1000 });
    const out = s.update({ now: 1500, items: [], current: 2, heardAt: 1500 });
    assert.deepEqual(ids(out), []);
  });

  it('clears after 15 s without a confident word, not after 5 s', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000)], current: 1, heardAt: 1000 });
    let out = s.update({ now: 7000, items: [c(7, 0.3, 6900)], current: 1, heardAt: 1000 });
    assert.deepEqual(ids(out), [7], 'a 6 s pause keeps the list');
    out = s.update({ now: 16500, items: [c(7, 0.3, 16400)], current: 1, heardAt: 1000 });
    assert.deepEqual(ids(out), []);
  });

  it('hides a Shabad that moved to the change card at once', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000), c(8, 0.2, 1000)], current: 1, heardAt: 1000 });
    const out = s.update({ now: 1500, items: [], current: 1, heardAt: 1500, hide: [7] });
    assert.deepEqual(ids(out), [8]);
  });

  it('new cards join at the bottom; order holds unless clearly overtaken for 2 s', () => {
    const s = createShelf();
    let out = s.update({ now: 1000, items: [c(7, 0.2, 1000)], current: 1, heardAt: 1000 });
    out = s.update({
      now: 1500,
      items: [c(7, 0.2, 1500), c(8, 0.4, 1500)],
      current: 1,
      heardAt: 1500,
    });
    assert.deepEqual(ids(out), [7, 8], 'newcomer joins at the bottom even when stronger');
    // 3 points ahead: never swaps
    for (let t = 2000; t <= 6000; t += 500) {
      out = s.update({
        now: t,
        items: [c(7, 0.2, t), c(8, 0.23, t)],
        current: 1,
        heardAt: t,
      });
    }
    assert.deepEqual(ids(out), [7, 8]);
    // 20 points ahead: swaps only after 2 s
    out = s.update({
      now: 6500,
      items: [c(7, 0.2, 6500), c(8, 0.4, 6500)],
      current: 1,
      heardAt: 6500,
    });
    assert.deepEqual(ids(out), [7, 8]);
    out = s.update({
      now: 7500,
      items: [c(7, 0.2, 7500), c(8, 0.4, 7500)],
      current: 1,
      heardAt: 7500,
    });
    assert.deepEqual(ids(out), [7, 8]);
    out = s.update({
      now: 8600,
      items: [c(7, 0.2, 8600), c(8, 0.4, 8600)],
      current: 1,
      heardAt: 8600,
    });
    assert.deepEqual(ids(out), [8, 7]);
  });

  it('lists up to 5; a newcomer takes a fading card or one it clearly beats for 2 s', () => {
    const s = createShelf();
    const five = (t) => [1, 2, 3, 4, 5].map((k) => c(10 + k, 0.1 + k * 0.01, t));
    let out = s.update({ now: 1000, items: five(1000), current: 1, heardAt: 1000 });
    assert.equal(out.length, 5);
    // a weak newcomer waits for a place
    out = s.update({
      now: 1500,
      items: [...five(1500), c(99, 0.05, 1500)],
      current: 1,
      heardAt: 1500,
    });
    assert.equal(out.length, 5);
    assert.ok(!ids(out).includes(99));
    assert.deepEqual(
      s.waiting().map((w) => w.shabadId),
      [99],
    );
    // a strong newcomer cannot push out a card listed under 4 s ago
    out = s.update({
      now: 2000,
      items: [...five(2000), c(98, 0.5, 2000)],
      current: 1,
      heardAt: 2000,
    });
    assert.ok(!ids(out).includes(98));
    // after that, it must lead the weakest clearly for 2 s, then joins at the bottom
    out = s.update({
      now: 5000,
      items: [...five(5000), c(98, 0.5, 5000)],
      current: 1,
      heardAt: 5000,
    });
    assert.ok(!ids(out).includes(98));
    out = s.update({
      now: 7100,
      items: [...five(7100), c(98, 0.5, 7100)],
      current: 1,
      heardAt: 7100,
    });
    assert.equal(out.length, 5);
    assert.equal(out[4].shabadId, 98);
    assert.ok(!ids(out).includes(11));
  });

  it('a fading card gives its place to a newcomer at once', () => {
    const s = createShelf();
    const five = [1, 2, 3, 4, 5].map((k) => c(10 + k, 0.2, 1000));
    s.update({ now: 1000, items: five, current: 1, heardAt: 1000 });
    const four = [2, 3, 4, 5].map((k) => c(10 + k, 0.2, 6500));
    const out = s.update({
      now: 6500,
      items: [...four, c(98, 0.1, 6500)],
      current: 1,
      heardAt: 6500,
    });
    assert.ok(ids(out).includes(98));
    assert.ok(!ids(out).includes(11));
  });
});
