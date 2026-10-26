// node --test www/main/addons/voice-follow/engine/pace.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

const fresh = () => {
  delete require.cache[require.resolve('./pace')];
  return require('./pace'); // eslint-disable-line global-require
};
describe('pace: kirtan scope', () => {
  it('fast tier is unchanged in kirtan', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    assert.equal(pace.current().name, 'fast');
    assert.equal(pace.windowS('recognizer', 4), 4);
    assert.equal(pace.hopS('follower', 0.25), 0.25);
  });
  it('a slow tier keeps 4 s windows in kirtan and puts the follower on the recognizer beat', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    let t = 0;
    for (let k = 0; k < 200 && pace.describe().kirtanTier === 'fast'; k += 1) {
      t += 250;
      pace.observe(0.9, 1e6 + t);
    }
    assert.notEqual(pace.describe().kirtanTier, 'fast', 'stepped down from fast');
    assert.equal(pace.current().name.startsWith('kirtan-'), true);
    assert.equal(pace.windowS('recognizer', 4), 4, 'recognizer keeps its 4 s window');
    assert.equal(pace.windowS('follower', 4), 4);
    assert.equal(
      pace.hopS('follower', 0.25),
      pace.hopS('recognizer', 0.5),
      'same beat: one shared pass',
    );
  });
  it('a kirtan step does not carry over to a later read Bani', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    let t = 0;
    for (let k = 0; k < 200 && pace.describe().kirtanTier === 'fast'; k += 1) {
      t += 250;
      pace.observe(0.9, 1e6 + t);
    }
    assert.notEqual(pace.describe().kirtanTier, 'fast');
    pace.setScoped(true, 'read');
    assert.equal(pace.describe().tier, 'fast');
    assert.equal(pace.current().name, 'fast');
    assert.equal(pace.windowS('recognizer', 4), 4);
  });
  it('kirtan skips the empty sync -> lean step (same schedule)', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    let t = 1e6;
    const names = [];
    for (let k = 0; k < 400; k += 1) {
      t += 250;
      const ev = pace.observe(0.9, t);
      if (ev) names.push(`${ev.from}>${ev.to}`);
    }
    assert.deepEqual(names, ['fast>kirtan-lean', 'kirtan-lean>kirtan-min']);
  });
  it('kirtan steps down on a saw-tooth backlog that is never 3 s above in a row', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    let t = 1e6;
    let stepped = false;
    for (let k = 0; k < 120 && !stepped; k += 1) {
      t += 250;
      const ev = pace.observe(k % 4 < 2 ? 0.9 : 0.1, t); // above half the time, never > 0.5 s straight
      if (ev) stepped = true;
    }
    assert.ok(stepped, 'saw-tooth backlog stepped the tier down');
  });
  it('read Bani does not step down on the same saw-tooth (unchanged rule)', () => {
    const pace = fresh();
    pace.setScoped(true, 'read');
    let t = 1e6;
    let stepped = false;
    for (let k = 0; k < 120 && !stepped; k += 1) {
      t += 250;
      if (pace.observe(k % 4 < 2 ? 0.9 : 0.1, t)) stepped = true;
    }
    assert.equal(stepped, false);
  });
});

describe('follower: dwells keep their wall-clock meaning on a slower hop', () => {
  it('scales window counts by the hop', () => {
    const { Follower } = require('./follower'); // eslint-disable-line global-require
    const f = Object.create(Follower.prototype);
    f.base = {
      hopS: 0.25,
      dwell: 3,
      dwellAdv: 1,
      dwellBack: 2,
      dwellSkip: null,
      initConfirm: 4,
      release: 14,
    };
    assert.equal(f.scaled(1), f.base);
    const c = f.scaled(2);
    assert.deepEqual(
      [c.dwell, c.dwellAdv, c.dwellBack, c.dwellSkip, c.initConfirm, c.release],
      [2, 1, 1, null, 2, 7],
    );
    assert.deepEqual([f.scaled(4).initConfirm, f.scaled(4).release], [1, 4]);
  });
});

describe('pace: kirtan starts at fast', () => {
  it('a slow self-test moves read Banis, not kirtan', async () => {
    const pace = fresh();
    const slow = {
      emissions: async () => {
        const t = Date.now();
        while (Date.now() - t < 200);
      },
    };
    await pace.selfTest(slow, { passes: 1, warm: 0 });
    assert.notEqual(pace.describe().tier, 'fast');
    pace.setScoped(true, 'kirtan');
    assert.equal(pace.current().name, 'fast');
  });
});
