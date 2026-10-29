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

  it('a change of the Shabad on screen removes only that Shabad; the rest stay', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [c(7, 0.3, 1000), c(8, 0.2, 1000)], current: 1, heardAt: 1000 });
    const out = s.update({ now: 1500, items: [], current: 7, heardAt: 1500 });
    assert.deepEqual(ids(out), [8], 'the new Shabad on screen leaves the list, 8 stays');
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

  it('ordered by confidence; cards within a point keep their places', () => {
    const s = createShelf();
    let out = s.update({ now: 1000, items: [c(7, 0.2, 1000)], current: 1, heardAt: 1000 });
    out = s.update({
      now: 1500,
      items: [c(7, 0.2, 1500), c(8, 0.4, 1500)],
      current: 1,
      heardAt: 1500,
    });
    assert.deepEqual(ids(out), [8, 7], 'a stronger newcomer is listed above');
    // within a point of each other: no swapping back and forth
    for (let t = 2000; t <= 6000; t += 500) {
      const wob = t % 1000 ? 0.005 : -0.005;
      out = s.update({
        now: t,
        items: [c(7, 0.3 + wob, t), c(8, 0.3 - wob, t)],
        current: 1,
        heardAt: t,
      });
      assert.deepEqual(ids(out), [8, 7], `steady at ${t}`);
    }
    // clearly ahead (> 1 point): moves up at once
    out = s.update({
      now: 6500,
      items: [c(7, 0.35, 6500), c(8, 0.3, 6500)],
      current: 1,
      heardAt: 6500,
    });
    assert.deepEqual(ids(out), [7, 8]);
  });

  it('the change card holds through a wobble and the card returns to the list as itself', () => {
    const s = createShelf();
    const lead = { shabadId: 7, line: 'line 7', wins: 1, prog: 0.4 };
    s.update({ now: 1000, items: [c(7, 0.3, 1000), c(8, 0.2, 1000)], current: 1, heardAt: 1000 });
    let out = s.update({
      now: 1500,
      items: [c(7, 0.3, 1500), c(8, 0.2, 1500)],
      current: 1,
      heardAt: 1500,
      lead,
    });
    assert.deepEqual(ids(out), [8], 'moved out of the list');
    assert.equal(s.changeCard(1500).shabadId, 7);
    // the judge lets go for one decode: the card stays where it is
    out = s.update({ now: 2000, items: [c(7, 0.3, 2000)], current: 1, heardAt: 2000 });
    assert.deepEqual(ids(out), [8]);
    assert.equal(s.changeCard(2000).shabadId, 7);
    assert.equal(s.changeCard(2000).live, false);
    // ... and is back the next one
    s.update({ now: 2500, items: [c(7, 0.3, 2500)], current: 1, heardAt: 2500, lead });
    assert.equal(s.changeCard(2500).live, true);
    // let go for longer than the hold: back in the list, not fading
    out = s.update({ now: 5200, items: [c(7, 0.3, 5200)], current: 1, heardAt: 5200 });
    assert.equal(s.changeCard(5200), null);
    assert.deepEqual(ids(out), [7, 8]);
    assert.equal(out[0].fading, false);
  });

  it('the change card goes when its Shabad is put on screen', () => {
    const s = createShelf();
    const lead = { shabadId: 7, line: 'line 7', wins: 2 };
    s.update({
      now: 1000,
      items: [c(7, 0.3, 1000), c(8, 0.2, 1000)],
      current: 1,
      heardAt: 1000,
      lead,
    });
    const out = s.update({ now: 1500, items: [], current: 7, heardAt: 1500 });
    assert.equal(s.changeCard(1500), null);
    assert.deepEqual(ids(out), [8]);
  });

  it('carries progress toward a switch, held and decaying like the %', () => {
    const s = createShelf();
    s.update({ now: 1000, items: [{ ...c(7, 0.1, 1000), prog: 0.5 }], current: 1, heardAt: 1000 });
    const out = s.update({ now: 9000, items: [], current: 1, heardAt: 9000 });
    assert.ok(out[0].prog > 0.2 && out[0].prog < 0.5);
  });

  it('lists up to 5; a newcomer takes a fading card or one it clearly beats for 2 s', () => {
    const s = createShelf({ max: 5 });
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
    // after that, it must lead the weakest clearly for 2 s
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
    assert.equal(out[0].shabadId, 98, 'listed, by confidence');
    assert.ok(!ids(out).includes(11));
  });

  it('a fading card gives its place to a newcomer at once', () => {
    const s = createShelf({ max: 5 });
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

  it('evidence cards: ordered by evidence, stay while it lasts, never shown fading', () => {
    const s = createShelf();
    const e = (id, total) => ({
      shabadId: id,
      pct: 0.01,
      line: `l${id}`,
      ev: { total, fill: total / 2.3 },
    });
    let out = s.update({ now: 1000, items: [e(7, 0.5), e(8, 1.2)], current: 1, heardAt: 1000 });
    assert.deepEqual(ids(out), [8, 7]);
    // 30 s later, still offered (the evidence is fading slowly): still listed, not fading
    out = s.update({ now: 31000, items: [e(7, 0.3), e(8, 0.4)], current: 1, heardAt: 31000 });
    assert.deepEqual(ids(out), [8, 7], 'within the 0.25 hysteresis: keeps its place');
    assert.equal(out[0].fading, false);
    // its evidence is gone: it leaves
    out = s.update({ now: 32000, items: [e(8, 0.4)], current: 1, heardAt: 32000 });
    assert.deepEqual(ids(out), [8]);
  });

  it('Changing to stays while the evidence stays built up, then returns to the list', () => {
    const s = createShelf();
    const e = (id, fill) => ({
      shabadId: id,
      pct: 0.02,
      line: `l${id}`,
      ev: { total: fill * 2.3, fill },
    });
    const lead = { shabadId: 7, line: 'l7', wins: 1 };
    s.update({ now: 1000, items: [e(7, 0.7)], current: 1, heardAt: 1000, lead });
    let out = s.update({ now: 5000, items: [e(7, 0.65)], current: 1, heardAt: 5000 });
    assert.equal(s.changeCard(5000).shabadId, 7, 'judge let go 4 s ago, evidence still 65%');
    assert.deepEqual(ids(out), []);
    out = s.update({ now: 9000, items: [e(7, 0.4)], current: 1, heardAt: 9000 });
    assert.equal(s.changeCard(9000), null);
    assert.deepEqual(ids(out), [7]);
  });
});
