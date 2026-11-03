// The presenting-only gate: a display driven AND a recent screen change.
// Run with: node --test www/main/addons/voice-follow/shadow/presenting.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const p = require('./presenting');

const MIN = 60 * 1000;

describe('presenting gate', () => {
  const now = 1000000000;
  it('viewer open and a change 2 min ago presents', () => {
    assert.equal(p.isPresenting({ viewerOpen: true, lastChangeAt: now - 2 * MIN, now }), true);
  });
  it('single-display mode counts as a display', () => {
    assert.equal(
      p.isPresenting({ viewerOpen: false, singleDisplay: true, lastChangeAt: now - MIN, now }),
      true,
    );
  });
  it('no display: idle even with a fresh change', () => {
    assert.equal(p.isPresenting({ viewerOpen: false, lastChangeAt: now, now }), false);
  });
  it('display but no change in the last 10 min: idle', () => {
    assert.equal(
      p.isPresenting({ viewerOpen: true, lastChangeAt: now - 10 * MIN - 1, now }),
      false,
    );
    assert.equal(p.isPresenting({ viewerOpen: true, lastChangeAt: null, now }), false);
  });
  it('a session ends after the display has been off for 10 min straight', () => {
    let off = p.trackOff(true, null, now);
    assert.equal(off, null);
    off = p.trackOff(false, off, now + MIN); // viewer closed
    assert.equal(off, now + MIN);
    off = p.trackOff(false, off, now + 5 * MIN); // keeps the first off time
    assert.equal(off, now + MIN);
    assert.equal(p.stopReason(off, now + 10 * MIN), null);
    assert.equal(p.stopReason(off, now + 11 * MIN), 'not_presenting');
    assert.equal(p.trackOff(true, off, now + 12 * MIN), null); // viewer back: reset
  });
  it('change recency gates starting only: a long Shabad on one pangti never ends a session', () => {
    // Viewer open, last screen change 25 min ago: no new session would start...
    assert.equal(p.isPresenting({ viewerOpen: true, lastChangeAt: now - 25 * MIN, now }), false);
    // ...but a running one is not stopped by this gate while the display stays on.
    const off = p.trackOff(p.displayOn({ viewerOpen: true }), null, now);
    assert.equal(off, null);
    assert.equal(p.stopReason(off, now), null);
  });
  it('the quiet stop (service.js) needs 30 min with neither voice nor a change', () => {
    // eslint-disable-next-line global-require
    const service = require('./service');
    const base = { now, startedAt: now - 60 * MIN, startedBy: 'screen', vfUpAt: now - 59 * MIN };
    const at = (min) => ({
      lastChangeAt: now - min * MIN,
      lastHeardAt: now - min * MIN,
      lastSoundAt: now - min * MIN,
    });
    // Voice and change 25 min ago: keep going (the old 5 min rule would have stopped).
    assert.equal(service.stopReason({ ...base, ...at(25) }), null);
    // Nothing for 31 min: quiet.
    assert.equal(service.stopReason({ ...base, ...at(31) }), 'quiet');
  });
});
