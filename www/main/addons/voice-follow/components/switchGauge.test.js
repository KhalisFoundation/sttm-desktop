// Unit tests for switchGauge.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  acousticGauge,
  cumulationGauge,
  fragmentGauge,
  gauge,
  createSoon,
} = require('./switchGauge');
const pc = require('./panktiCumulation');
const frag = require('./fragmentConfirm');

const ACOUSTIC = { min: 0.65, margin: 0.15 };
const PC = { ...pc.DEFAULTS, lock: 2.0, distinct: 3, lead: 1.5 };
const FR = { ...frag.DEFAULTS };
const CFG = { acoustic: ACOUSTIC };

describe('switchGauge: acoustic judge', () => {
  it('reads 1 exactly at the commit and 0 far from a win', () => {
    assert.equal(acousticGauge({ score: 0.9, wins: 3, needed: 3, sCur: 0.2 }, ACOUSTIC), 1);
    assert.equal(acousticGauge({ score: 0.3, wins: 0, needed: 3, sCur: 0.9 }, ACOUSTIC), 0);
  });
  it('climbs one step per win', () => {
    const w = (wins) => acousticGauge({ score: 0.7, wins, needed: 3, sCur: 0.3 }, ACOUSTIC);
    assert.equal(w(0), 0.25);
    assert.equal(w(1), 0.5);
    assert.equal(w(2), 0.75);
  });
});

describe('switchGauge: Pankti Cumulation (switch)', () => {
  it('is the weakest of total, distinct pangtis and lead, and 1 only when the store is ready', () => {
    const store = new Map();
    const hit = (verseId) =>
      pc.addHit(store, { shabadId: 7, verseId, score: 0.9, margin: 0.3 }, PC);
    hit(100);
    // one pangti of three: distinct is the weakest condition
    assert.ok(Math.abs(cumulationGauge(store, 7, PC) - 1 / 3) < 1e-9);
    hit(101);
    const two = cumulationGauge(store, 7, PC);
    assert.ok(two > 1 / 3 && two < 1);
    const r = hit(105);
    assert.equal(r.ready, true);
    assert.equal(cumulationGauge(store, 7, PC), 1);
  });
  it('a rival Shabad with weight holds the gauge below 1 until this one leads it 1.5x', () => {
    const store = new Map();
    [100, 101, 105].forEach((v) =>
      pc.addHit(store, { shabadId: 7, verseId: v, score: 0.9, margin: 0.3 }, PC),
    );
    [200, 201].forEach((v) =>
      pc.addHit(store, { shabadId: 9, verseId: v, score: 0.9, margin: 0.3 }, PC),
    );
    const own = pc.shabadTotal(store.get(7)).total;
    const next = pc.shabadTotal(store.get(9)).total;
    const expect = Math.min(1, own / (PC.lead * next));
    assert.ok(Math.abs(cumulationGauge(store, 7, PC) - expect) < 1e-9);
    assert.equal(cumulationGauge(store, 3, PC), 0);
  });
});

describe('switchGauge: fragment confirm', () => {
  it('needs fewer pangtis on the Changing-to card than in the list', () => {
    const store = new Map();
    store.set(
      7,
      new Map([
        [0, 1],
        [1, 0.4],
      ]),
    );
    assert.equal(fragmentGauge(store, 7, 'change', FR), Math.min(1.4 / FR.lock, 1));
    assert.ok(fragmentGauge(store, 7, 'list', FR) < fragmentGauge(store, 7, 'change', FR));
    assert.equal(fragmentGauge(store, 8, 'list', FR), 0);
  });
  it('counts only pangtis heard recently, and a gated confirm stays just under 1', () => {
    const store = new Map();
    store.set(
      7,
      new Map([
        [0, 1],
        [1, 1],
      ]),
    );
    const hitAt = new Map([
      [0, 1000],
      [1, 30000],
    ]);
    const fresh = { hitAt, now: 31000, freshMs: 20000 };
    assert.equal(fragmentGauge(store, 7, 'change', FR), 1); // without freshness: 2 of 2
    assert.equal(fragmentGauge(store, 7, 'change', FR, fresh), 0.5); // line 0 is stale
    assert.equal(fragmentGauge(store, 7, 'change', FR, { gated: true }), 0.95);
  });
});

describe('switchGauge: gauge', () => {
  it('takes the furthest route and names it', () => {
    assert.deepEqual(gauge({ acoustic: null, cumulation: 0, fragment: 0 }, CFG), {
      prog: 0,
      route: null,
    });
    assert.deepEqual(gauge({ acoustic: null, cumulation: 0.4, fragment: 0.7 }, CFG), {
      prog: 0.7,
      route: 'pieces',
    });
    const g = gauge(
      { acoustic: { score: 0.9, wins: 2, needed: 3, sCur: 0.2 }, cumulation: 0.5, fragment: 0 },
      CFG,
    );
    assert.equal(g.route, 'judge');
    assert.equal(g.prog, 0.75); // 2 wins of 3 and this decode a clear win: one step to go
  });
});

describe('switchGauge: switching soon', () => {
  it('comes on at the threshold, holds through a dip, and goes off only well below', () => {
    const s = createSoon({ soonOn: 0.66, soonOff: 0.45, soonHoldMs: 1500 });
    assert.equal(s.update(7, 0.5, 0), false);
    assert.equal(s.update(7, 0.7, 500), true);
    assert.equal(s.update(7, 0.5, 1000), true); // between the two lines: stays on
    assert.equal(s.update(7, 0.2, 1200), true); // too soon to drop
    assert.equal(s.update(7, 0.2, 2100), false);
    assert.equal(s.update(7, 0.6, 2200), false); // off: needs the full threshold again
  });
  it('forgets Shabads that left the panel', () => {
    const s = createSoon();
    s.update(7, 0.9, 0);
    s.update(8, 0.9, 0);
    s.prune(new Set([8]));
    assert.equal(s.update(7, 0.5, 10), false);
    assert.equal(s.update(8, 0.5, 10), true);
  });
});
