// Unit tests: STTM's Auto Play timer never drives the screen while Voice Autopilot is on.
// Run with: node --test www/main/addons/voice-follow/components/
// Renton, Oct 26: Auto Play (10 s) kept moving the screen during Akhand Paath while
// Autopilot was on, and about 3 in 10 of those moves came before the pangti was finished.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  AUTOPLAY_TICK_GRACE_MS,
  autoplayMayAdvance,
  noteAutoplayTick,
  autoplayTickedRecently,
} = require('./autopilotScreen');
const { createLineRespect } = require('./lineRespect');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('autoplayMayAdvance', () => {
  it('Auto Play runs as before when Autopilot is off', () => {
    assert.equal(autoplayMayAdvance({ autoplayToggle: true, autopilotLive: false }), true);
    assert.equal(autoplayMayAdvance({ autoplayToggle: false, autopilotLive: false }), false);
  });
  it('Auto Play is paused while Autopilot is on', () => {
    assert.equal(autoplayMayAdvance({ autoplayToggle: true, autopilotLive: true }), false);
    assert.equal(autoplayMayAdvance({ autoplayToggle: false, autopilotLive: true }), false);
  });
});

describe('autoplay tick marker', () => {
  it('a line change right after a timer move is the timer’s, later ones are not', () => {
    const t = 5000000;
    noteAutoplayTick(t);
    assert.equal(autoplayTickedRecently(t + 10), true);
    assert.equal(autoplayTickedRecently(t + AUTOPLAY_TICK_GRACE_MS), true);
    assert.equal(autoplayTickedRecently(t + AUTOPLAY_TICK_GRACE_MS + 1), false);
  });
});

describe('lineRespect and the Auto Play timer', () => {
  const ctx = { now: 1000, following: true, sameShabad: true, known: true };
  it('a timer move is never a sevadaar move', () => {
    const lr = createLineRespect();
    assert.equal(lr.classify(42, { ...ctx, autoplay: true }), 'ignore');
  });
  it('a real sevadaar move is still seen', () => {
    const lr = createLineRespect();
    assert.equal(lr.classify(42, { ...ctx, autoplay: false }), 'sevadaar');
    assert.equal(lr.classify(42, ctx), 'sevadaar');
  });
  it('the app’s own write is still the app’s', () => {
    const lr = createLineRespect();
    lr.appWrote(42, 1000);
    assert.equal(lr.classify(42, { ...ctx, autoplay: true }), 'app');
  });
});

// Wiring: the screens use the rule (these fail if the guard is removed).
describe('Auto Play guard wiring', () => {
  it('the Shabad pane timer is gated on Autopilot and notes its moves', () => {
    const src = read('../../../navigator/shabad/ShabadText.jsx');
    const i = src.indexOf('const milisecondsDelay');
    assert.ok(i > 0);
    const effect = src.slice(src.lastIndexOf('useEffect(', i), src.indexOf('}, [', i) + 80);
    assert.match(effect, /autoplayMayAdvance\(\{ autoplayToggle, autopilotLive \}\)/);
    assert.match(effect, /noteAutoplayTick\(\)/);
    assert.match(effect, /\}, \[[^\]]*autopilotLive[^\]]*\]\)/);
  });
  it('the Auto Play button is disabled with a tooltip while Autopilot is on', () => {
    const src = read('../../../viewer/Slide/AutoPlayIcon.jsx');
    assert.match(src, /disabled=\{autopilotLive\}/);
    assert.match(src, /title=\{autopilotLive \? AUTOPILOT_FOLLOWING_TIP : undefined\}/);
  });
  it('the viewers are told when Autopilot is on', () => {
    const src = read('../../../common/store/GlobalState.js');
    const i = src.indexOf('setAutopilotLive: action(');
    assert.match(src.slice(i, i + 600), /actionName: 'setAutopilotLive'/);
  });
  it('Autopilot tags timer moves and logs Auto Play in the session', () => {
    const src = read('./VoiceFollow.jsx');
    assert.match(src, /autoplay: autoplayTickedRecently\(now\)/);
    assert.match(src, /sessionLog\.logEvent\('autoplay'/);
  });
});
