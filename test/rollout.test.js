const test = require('node:test');
const assert = require('node:assert');
const { decide, shouldAutoUpdate } = require('../rollout');

const UNTIL = '2099-01-01';
const rules = { version: '9.1.0', until: UNTIL, regions: ['US-CA', 'US-WA', 'GB'], geoUrl: 'https://geo.test' };
const fake = (map) => async (url) => {
  if (map[url] instanceof Error) throw map[url];
  return map[url];
};

test('state in the list updates', () => {
  assert.strictEqual(
    decide({ rules, appVersion: '9.0.5', location: { country: 'US', region: 'US-CA' } }).update,
    true,
  );
});
test('state not in the list waits', () => {
  assert.strictEqual(
    decide({ rules, appVersion: '9.0.5', location: { country: 'US', region: 'US-NY' } }).update,
    false,
  );
});
test('whole country listed updates any region in it', () => {
  assert.strictEqual(
    decide({ rules, appVersion: '9.0.5', location: { country: 'GB', region: 'GB-ENG' } }).update,
    true,
  );
});
test('case-insensitive codes', () => {
  assert.strictEqual(
    decide({ rules, appVersion: '9.0.5', location: { country: 'us', region: 'us-wa' } }).update,
    true,
  );
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
  assert.strictEqual(
    decide({ rules: { version: 'x', regions: [] }, appVersion: '9.0.5' }).update,
    true,
  );
});
test('missing rollout file updates normally', async () => {
  const r = await shouldAutoUpdate('9.0.5', {
    rolloutUrl: 'r',
    getJson: fake({ r: new Error('404') }),
  });
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
  const r = await shouldAutoUpdate('9.0.5', {
    rolloutUrl: 'r',
    getJson: fake({ r: rules, 'https://geo.test': new Error('down') }),
  });
  assert.strictEqual(r.update, false);
});

const { distanceKm } = require('../rollout');

const areaRules = {
  version: '9.1.0',
  until: UNTIL,
  regions: ['US-WA'],
  areas: [{ name: 'Fresno', lat: 36.74, lon: -119.78, km: 60 }],
};

test('distance Seattle to Renton is about 17 km', () => {
  const d = distanceKm(47.606, -122.332, 47.482, -122.217);
  assert.ok(d > 14 && d < 20, `got ${d}`);
});
test('PC in Clovis (near Fresno) is inside the Fresno area', () => {
  const loc = { country: 'US', region: 'US-CA', city: 'Clovis', lat: 36.825, lon: -119.703 };
  assert.strictEqual(decide({ rules: areaRules, appVersion: '9.0.5', location: loc }).update, true);
});
test('PC in Los Angeles is outside the Fresno area', () => {
  const loc = { country: 'US', region: 'US-CA', city: 'Los Angeles', lat: 34.05, lon: -118.24 };
  assert.strictEqual(
    decide({ rules: areaRules, appVersion: '9.0.5', location: loc }).update,
    false,
  );
});
test('region rule still works alongside areas', () => {
  const loc = { country: 'US', region: 'US-WA', city: 'Seattle', lat: 47.6, lon: -122.33 };
  assert.strictEqual(decide({ rules: areaRules, appVersion: '9.0.5', location: loc }).update, true);
});
test('areas-only rule is a valid rule', () => {
  const rules = { version: '9.1.0', until: UNTIL, areas: areaRules.areas };
  const la = { country: 'US', region: 'US-CA', lat: 34.05, lon: -118.24 };
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: la }).update, false);
});
test('location without coordinates falls back to region only', () => {
  const loc = { country: 'US', region: 'US-CA' };
  assert.strictEqual(
    decide({ rules: areaRules, appVersion: '9.0.5', location: loc }).update,
    false,
  );
});
test('malformed area entries are ignored', () => {
  const rules = { version: '9.1.0', until: UNTIL, areas: [null, { name: 'x', lat: 'a', lon: 1, km: 5 }] };
  const loc = { country: 'US', lat: 1, lon: 1 };
  assert.strictEqual(decide({ rules, appVersion: '9.0.5', location: loc }).update, false);
});

test('junk input never throws, and with no valid rule always updates', async () => {
  const junk = [
    undefined,
    null,
    0,
    1,
    '',
    'x',
    [],
    {},
    true,
    NaN,
    { version: null },
    [1, 2],
    { regions: 'US-WA' },
    { version: {}, regions: [] },
    { version: '9.9.9', regions: {} },
  ];
  const locations = [undefined, null, {}, 'x', 5, { lat: 'a' }, { country: 7, region: [] }];
  for (const rules of junk) {
    for (const location of locations) {
      const r = decide({ rules, appVersion: '9.0.5', location });
      assert.strictEqual(r.update, true, JSON.stringify({ rules, location }));
    }
    const r = await shouldAutoUpdate('9.0.5', { rolloutUrl: 'r', getJson: async () => rules });
    assert.strictEqual(r.update, true);
  }
});
test('junk inside a real rule never throws', () => {
  const rules = {
    version: '9.1.0',
    until: UNTIL,
    regions: [null, 5, {}, 'US-WA'],
    areas: [null, 'x', {}, { lat: 1 }],
  };
  const locations = [
    undefined,
    null,
    {},
    { lat: 'a', lon: null },
    { country: 7, region: [] },
    { city: {} },
  ];
  for (const location of locations)
    assert.doesNotThrow(() => decide({ rules, appVersion: '9.0.5', location }));
});
test('unreadable app version updates normally', () => {
  assert.strictEqual(
    decide({ rules: { version: '9.1.0', regions: ['US-WA'] }, appVersion: 'garbage' }).update,
    true,
  );
});

test('rule past its until date: everyone updates', () => {
  const old = { ...rules, until: '2026-01-01' };
  const loc = { country: 'US', region: 'US-NY' };
  assert.strictEqual(decide({ rules: old, appVersion: '9.0.5', location: loc }).update, true);
});
test('rule without until is ignored: everyone updates', () => {
  const { until, ...noUntil } = rules;
  const loc = { country: 'US', region: 'US-NY' };
  assert.strictEqual(decide({ rules: noUntil, appVersion: '9.0.5', location: loc }).update, true);
  assert.strictEqual(decide({ rules: { ...rules, until: 'soon' }, appVersion: '9.0.5', location: loc }).update, true);
});
test('rule before its until date still holds back', () => {
  const r = { ...rules, until: '2026-12-01' };
  const loc = { country: 'US', region: 'US-NY' };
  const now = new Date('2026-11-01');
  assert.strictEqual(decide({ rules: r, appVersion: '9.0.5', location: loc, now }).update, false);
});
