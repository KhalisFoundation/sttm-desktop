// When a session is kept or thrown away, and when it stops, in the prod build (no speech
// model) and in the PROD_INFERENCE build.
// Run with: node --test www/main/addons/voice-follow/shadow/service.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const config = require('./config');
const service = require('./service');

const MIN = 60 * 1000;
const T = 1e12;

describe('service: prod discard rule (no speech model)', () => {
  it('this branch is the prod build', () => {
    assert.equal(config.PROD_INFERENCE, false);
    assert.equal(config.SHADOW_SHORT_DISCARD_MS, 5 * MIN);
  });

  it('a short session with no Gurbani shown is discarded', () => {
    const d = service.discardOnStop({ now: T + 4 * MIN, startedAt: T, gurbaniChanges: 0 });
    assert.equal(d, true);
  });

  it('a short session with a Gurbani change is kept', () => {
    const d = service.discardOnStop({ now: T + 1 * MIN, startedAt: T, gurbaniChanges: 1 });
    assert.equal(d, false);
  });

  it('a long session is kept even with no screen change (unattended kirtan)', () => {
    const d = service.discardOnStop({
      now: T + 5 * MIN,
      startedAt: T,
      startedBy: 'sound',
      gurbaniChanges: 0,
    });
    assert.equal(d, false);
  });

  it('the rule does not look at words heard (there are none in prod)', () => {
    const base = { now: T + 2 * MIN, startedAt: T, startedBy: 'sound', gurbaniChanges: 0 };
    assert.equal(service.discardOnStop({ ...base, lastHeardAt: T + MIN }), true);
    assert.equal(service.discardOnStop({ ...base, vfUpAt: T }), true);
  });

  it('the inference rule is still there for the experimental build', () => {
    const sound = { now: T + 10 * MIN, startedAt: T, startedBy: 'sound', inference: true };
    assert.equal(service.discardOnStop({ ...sound, vfUpAt: T }), true);
    assert.equal(service.discardOnStop({ ...sound, vfUpAt: T, lastHeardAt: T + MIN }), false);
    assert.equal(
      service.discardOnStop({ ...sound, startedBy: 'screen: shabad:1', gurbaniChanges: 0 }),
      false,
    );
  });
});

describe('service: stop rules in prod', () => {
  const quiet = config.SHADOW_QUIET_STOP_MS;
  const grace = config.SHADOW_CHANGE_GRACE_MS;

  it('no "no_words" stop without a speech model', () => {
    const r = service.stopReason({
      now: T + 4 * MIN,
      startedAt: T,
      startedBy: 'sound',
      lastChangeAt: T,
      lastSoundAt: T + 4 * MIN,
      vfUpAt: T,
    });
    assert.equal(r, null);
    const withModel = service.stopReason({
      now: T + 4 * MIN,
      startedAt: T,
      startedBy: 'sound',
      lastChangeAt: T,
      lastSoundAt: T + 4 * MIN,
      vfUpAt: T,
      inference: true,
    });
    assert.equal(withModel, 'no_words');
  });

  it('stops after the quiet time with no sound and no screen change', () => {
    const now = T + Math.max(quiet, grace) + MIN;
    assert.equal(
      service.stopReason({
        now,
        startedAt: T,
        startedBy: 'sound',
        lastChangeAt: T,
        lastSoundAt: T,
      }),
      'quiet',
    );
  });

  it('keeps going while the room sounds', () => {
    const now = T + Math.max(quiet, grace) + MIN;
    assert.equal(
      service.stopReason({
        now,
        startedAt: T,
        startedBy: 'sound',
        lastChangeAt: T,
        lastSoundAt: now,
      }),
      null,
    );
  });
});
