// guard(): a fault in the collector is swallowed (and logged), never thrown at the caller.
// Run with: node --test www/main/addons/voice-follow/shadow/diag.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { guard } = require('./diag');

describe('diag.guard', () => {
  it('passes results and arguments through', () => {
    assert.equal(guard('t', (a, b) => a + b)(2, 3), 5);
  });
  it('a sync throw becomes the fallback', () => {
    const f = guard(
      't',
      () => {
        throw new Error('boom');
      },
      'fb',
    );
    assert.equal(f(), 'fb');
  });
  it('a rejected promise resolves to the fallback', async () => {
    const f = guard(
      't',
      async () => {
        throw new Error('boom');
      },
      null,
    );
    assert.equal(await f(), null);
  });
  it('a resolved promise passes through', async () => {
    assert.equal(await guard('t', async () => 7)(), 7);
  });
});
