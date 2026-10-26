const test = require('node:test');
const assert = require('node:assert');
const { decide, shouldAutoUpdate } = require('../rollout');

const rules = { version: '9.1.0', regions: ['US-CA', 'US-WA', 'GB'], geoUrl: 'https://geo.test' };
const fake = (map) => async (url) => {
  if (map[url] instanceof Error) throw map[url];
  return map[url];
};

test('state in the list updates', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: { country: 'US', region: 'US-CA' } }).update, true);
});
test('state not in the list waits', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: { country: 'US', region: 'US-NY' } }).update, false);
});
test('whole country listed updates any region in it', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: { country: 'GB', region: 'GB-ENG' } }).update, true);
});
test('case-insensitive codes', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: { country: 'us', region: 'us-wa' } }).update, true);
});
test('already on the rollout version updates normally', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.1.0', location: null }).update, true);
});
test('unknown location waits', () => {
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: null }).update, false);
});
test('no rule or broken rule updates normally', () => {
  assert.strictEqual(decide({ rules: null, appVersion: '9.0.5' }).update, true);
  assert.strictEqual(decide({ rules: { version: '9.1.0' }, appVersion: '9.0.5' }).update, true);
  assert.strictEqual(decide({ rules: { version: 'x', regions: [] }, appVersion: '9.0.5' }).update, true);
});
test('missing rollout file updates normally', async () => {
  const r = await shouldAutoUpdate('9.0.5', { rolloutUrl: 'r', getJson: fake({ r: new Error('404') }) });
  assert.strictEqual(r.update, true);
});
test('location looked up only when needed', async () => {
  let geoCalls = 0;
  const getJson = async (url) => {
    if (url === 'r') return rules;
    geoCalls += 1;
    return { country: 'US', region: 'US-WA' };
  };
  assert.strictEqual((await shouldAutoUpdate('9.1.0', { rolloutUrl: 'r', getJson })).update, true);
  assert.strictEqual(geoCalls, 0);
  assert.strictEqual((await shouldAutoUpdate('9.0.5', { rolloutUrl: 'r', getJson })).update, true);
  assert.strictEqual(geoCalls, 1);
});
test('location service down waits', async () => {
  const r = await shouldAutoUpdate('9.0.5', { rolloutUrl: 'r', getJson: fake({ r: rules, 'https://geo.test': new Error('down') }) });
  assert.strictEqual(r.update, false);
});
