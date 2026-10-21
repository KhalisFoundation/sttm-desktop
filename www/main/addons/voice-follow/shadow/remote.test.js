// Collector remote switch rules. Run with: node --test www/main/addons/voice-follow/shadow/remote.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { enabledFrom, bucketOf } = require('./remote');

describe('prod switch', () => {
  const id = 'abc-123';
  it('is off unless the server says on for this install', () => {
    assert.equal(enabledFrom(null, id, true), false);
    assert.equal(enabledFrom({}, id, true), false);
    assert.equal(enabledFrom({ enabled: true }, id, true), false);
    assert.equal(enabledFrom({ enabled: true, allow: [id] }, id, true), true);
    assert.equal(enabledFrom({ enabled: false, allow: [id] }, id, true), false);
    assert.equal(enabledFrom({ enabled: true, percent: 100, block: [id] }, id, true), false);
    assert.equal(enabledFrom({ enabled: true, percent: 100 }, id, true), true);
    assert.equal(enabledFrom({ enabled: true, percent: 100 }, '', true), false);
  });
  it('percent buckets are stable and roughly even', () => {
    assert.equal(bucketOf('x'), bucketOf('x'));
    let on = 0;
    for (let i = 0; i < 2000; i += 1)
      if (enabledFrom({ enabled: true, percent: 10 }, `id-${i}`, true)) on += 1;
    assert.ok(on > 140 && on < 260, `10% rollout picked ${on}/2000`);
  });
});

describe('tester build switch', () => {
  it('only an explicit false turns it off', () => {
    assert.equal(enabledFrom(null, 'a', false), true);
    assert.equal(enabledFrom({ enabled: false }, 'a', false), false);
  });
});
