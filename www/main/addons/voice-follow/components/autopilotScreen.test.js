// Unit tests for autopilotScreen.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCROLL_PAUSE_MS,
  SCROLL_ACTIVE_MS,
  listScrollAction,
  screenTakenByCeremony,
} = require('./autopilotScreen');

const T = 1000000;
const range = { startIndex: 0, endIndex: 9 };

describe('listScrollAction', () => {
  it('follows every line change when Autopilot is off, even right after a scroll', () => {
    const a = listScrollAction({
      autopilotLive: false,
      lastUserScrollAt: T,
      now: T + 100,
      activeIndex: 40,
      range,
    });
    assert.equal(a, 'follow');
  });
  it('follows when the sevadaar has not scrolled', () => {
    const a = listScrollAction({
      autopilotLive: true,
      lastUserScrollAt: 0,
      now: T,
      activeIndex: 40,
    });
    assert.equal(a, 'follow');
  });
  it('keeps the view while they are scrolling, even if the line is in view', () => {
    const a = listScrollAction({
      autopilotLive: true,
      lastUserScrollAt: T,
      now: T + SCROLL_ACTIVE_MS - 1,
      activeIndex: 5,
      range,
    });
    assert.equal(a, 'keep');
  });
  it('keeps the view during the pause while the line is out of view', () => {
    const a = listScrollAction({
      autopilotLive: true,
      lastUserScrollAt: T,
      now: T + SCROLL_PAUSE_MS - 1,
      activeIndex: 40,
      range,
    });
    assert.equal(a, 'keep');
  });
  it('resumes once the pause is over', () => {
    const a = listScrollAction({
      autopilotLive: true,
      lastUserScrollAt: T,
      now: T + SCROLL_PAUSE_MS,
      activeIndex: 40,
      range,
    });
    assert.equal(a, 'resume');
  });
  it('resumes early when they have scrolled back near the line', () => {
    const a = listScrollAction({
      autopilotLive: true,
      lastUserScrollAt: T,
      now: T + 3000,
      activeIndex: 9,
      range,
    });
    assert.equal(a, 'resume');
  });
});

describe('screenTakenByCeremony', () => {
  it('flags a ceremony opened while Autopilot follows on screen', () => {
    assert.equal(
      screenTakenByCeremony({ following: true, visible: true, isCeremonyBani: true }),
      true,
    );
  });
  it('does not flag while searching, in shadow mode, or for a non-ceremony', () => {
    assert.equal(
      screenTakenByCeremony({ following: false, visible: true, isCeremonyBani: true }),
      false,
    );
    assert.equal(
      screenTakenByCeremony({ following: true, visible: false, isCeremonyBani: true }),
      false,
    );
    assert.equal(
      screenTakenByCeremony({ following: true, visible: true, isCeremonyBani: false }),
      false,
    );
  });
});
