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
    for (let k = 0; k < 200 && pace.describe().tier === 'fast'; k += 1) {
      t += 250;
      pace.observe(0.9, 1e6 + t);
    }
    assert.notEqual(pace.describe().tier, 'fast', 'stepped down from fast');
    assert.equal(pace.current().name.startsWith('kirtan-'), true);
    assert.equal(pace.windowS('recognizer', 4), 4, 'recognizer keeps its 4 s window');
    assert.equal(pace.windowS('follower', 4), 4);
    assert.equal(
      pace.hopS('follower', 0.25),
      pace.hopS('recognizer', 0.5),
      'same beat: one shared pass',
    );
  });
  it('the same slow tier still shortens read-Bani windows as before', () => {
    const pace = fresh();
    pace.setScoped(true, 'kirtan');
    let t = 0;
    for (let k = 0; k < 200 && pace.describe().tier === 'fast'; k += 1) {
      t += 250;
      pace.observe(0.9, 1e6 + t);
    }
    pace.setScoped(true, 'read');
    assert.equal(pace.current().name, pace.describe().tier);
    if (pace.current().windowS) assert.equal(pace.windowS('recognizer', 4), pace.current().windowS);
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
