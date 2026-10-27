// The Bani Overlay's Akhand Paath block (the pangti before and the current one) is up only
// while Voice Autopilot follows an Akhand Paath read at a normal or fast pace. Normal paath,
// kirtan and a slow Akhand Paath keep the normal overlay. Never saved: off on every launch.
// CommonJS so node --test can load it (see akhandOverlay.test.js).

// Reading pace in words per second over the latest pangtis read in order. Renton's Akhand
// Paath (Oct 26) read at 1.5-2.4 words/s; its slower stretch at 1.1-1.45.
const FAST_ON_WPS = 1.55; // the block comes up at this pace or faster...
const FAST_OFF_WPS = 1.35; // ...and gives way to the normal overlay below this
const PACE_STEPS = 12; // pangtis the pace is measured over (the latest ones)
const PACE_MIN_STEPS = 4; // fewer steps than this: no pace yet
const PACE_GAP_S = 30; // a step slower than this (a pause, an Ardas) is not counted

// Pace of a reading from the pangtis put on screen. A step is one pangti to the very next
// (consecutive verse ids in Sri Guru Granth Sahib Ji); its words are those of the pangti left.
const createPace = () => {
  const steps = [];
  let last = null;
  return {
    line(verseId, words, nowMs) {
      if (last && verseId === last.verseId + 1) {
        const dt = (nowMs - last.t) / 1000;
        if (dt > 0 && dt <= PACE_GAP_S) {
          steps.push({ words: last.words, dt });
          if (steps.length > PACE_STEPS) steps.shift();
        }
      }
      if (!last || verseId !== last.verseId) last = { verseId, words, t: nowMs };
    },
    wps() {
      if (steps.length < PACE_MIN_STEPS) return null;
      const words = steps.reduce((m, s) => m + s.words, 0);
      const secs = steps.reduce((m, s) => m + s.dt, 0);
      return secs > 0 ? words / secs : null;
    },
    reset() {
      steps.length = 0;
      last = null;
    },
  };
};

// Should the block be up, given the pace and whether it is up now (two thresholds, so a
// reader near the line does not flip the overlay back and forth)?
const fastEnough = (wps, on) => wps != null && wps >= (on ? FAST_OFF_WPS : FAST_ON_WPS);

// Shared between Voice Autopilot (sets it) and the Shabad pane that sends the overlay its line.
let on = false;
const subs = new Set();
const akhandOverlayOn = () => on;
const setAkhandOverlay = (value) => {
  const v = !!value;
  if (v === on) return;
  on = v;
  subs.forEach((f) => {
    try {
      f(on);
    } catch (_) {
      /* a listener never gets in the way of the others */
    }
  });
};
const onAkhandOverlay = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};

module.exports = {
  FAST_ON_WPS,
  FAST_OFF_WPS,
  createPace,
  fastEnough,
  akhandOverlayOn,
  setAkhandOverlay,
  onAkhandOverlay,
};
