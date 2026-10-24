// node --test www/main/addons/voice-follow/engine/hwcheck.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { grade, summary } = require('./hwcheck');

describe('hwcheck.grade', () => {
  it('fast machine is great', () => {
    const g = grade({ pass10Ms: 120, pass4Ms: 40, ramGb: 16 });
    assert.equal(g.verdict, 'great');
    assert.equal(g.headroom, 4.2);
  });
  it('Renton-class desktop (~150 ms) meets the minimum', () => {
    assert.equal(grade({ pass10Ms: 380, pass4Ms: 150, ramGb: 17 }).verdict, 'ok');
  });
  it('ThinkPad E14 (~161 ms, ran a whole diwan well) meets the minimum, with brief catch-ups', () => {
    const g = grade({ pass10Ms: 410, pass4Ms: 161, ramGb: 15 });
    assert.equal(g.verdict, 'ok');
    const line = summary({
      ...g,
      pass10Ms: 410,
      pass4Ms: 161,
      specs: { cpu: 'Ryzen 7 250', cores: 16, ramGb: 15, os: 'win32', arch: 'x64' },
    });
    assert.ok(line.includes('keeps up with brief catch-ups'));
  });
  it('laptops ~2x too slow (i7-7500U, i7-1255U) are below the minimum', () => {
    assert.equal(grade({ pass10Ms: 900, pass4Ms: 356, ramGb: 13 }).verdict, 'below');
    assert.equal(grade({ pass10Ms: 950, pass4Ms: 381, ramGb: 17 }).verdict, 'below');
  });
  it('6 GB of memory is below the minimum; 8 GB machines (reporting ~7.3 GB) pass', () => {
    assert.equal(grade({ pass10Ms: 100, pass4Ms: 30, ramGb: 6 }).verdict, 'below');
    assert.equal(grade({ pass10Ms: 100, pass4Ms: 30, ramGb: 7.3 }).verdict, 'great');
  });
  it('too slow says how much, never "faster than needed"', () => {
    const g = grade({ pass10Ms: 1100, pass4Ms: 443, ramGb: 6 });
    const line = summary({
      ...g,
      pass10Ms: 1100,
      pass4Ms: 443,
      specs: { cpu: 'Ryzen 5 7520U', cores: 8, ramGb: 6, os: 'win32', arch: 'x64' },
    });
    assert.ok(line.includes('too slow'));
    assert.ok(!line.includes('faster than needed'));
  });
  it('summary is one line with specs', () => {
    const r = {
      ...grade({ pass10Ms: 120, pass4Ms: 40 }),
      pass10Ms: 120,
      pass4Ms: 40,
      specs: { cpu: 'Test CPU', cores: 8, ramGb: 16, os: 'win32 10', arch: 'x64' },
    };
    const s = summary(r, '9.0.8');
    assert.ok(s.startsWith('Great'));
    assert.ok(s.includes('Test CPU, 8 cores, 16 GB RAM'));
    assert.ok(!s.includes('\n'));
  });
});
