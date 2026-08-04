/**
 * Opt-in trace buffer for diagnosing Akhand Paatth infinite scroll.
 *
 * The symptoms (a jump, a stall, two screens drifting apart) are transient and
 * vanish the moment you pause to inspect anything, so the deck records its
 * decisions as they happen. Inert unless switched on: one boolean check per call,
 * no allocation.
 *
 * From the DevTools console of the viewer (or the `<webview>`):
 *
 *     window.__akhandDebug = true;   // start recording
 *     // ...reproduce the problem...
 *     copy(window.__akhandLog);      // timestamped events, newest 4000 kept
 *     window.__akhandDebug = false;  // stop
 *
 * Each entry is `{ t, event, ...data }`, where `t` is `performance.now()` in ms.
 * Correlate `t` with a sampled `scrollTop` trace to see which operation moved the
 * scroll position and by how much.
 *
 * The events, grouped by what they tell you:
 *
 * - Opening a reading: `seed`, `seekApply`, `backJump`, `reseedForPrunedVerse`
 * - Just-in-time loading: `append`, `prepend`, `appendFailed`, `prependFailed`
 * - Releasing memory behind the reader: `prune`, `pruneBottom`
 * - Holding the reader's place: `anchorComp`, `anchorSettle`
 * - Manual scrolling: `wheelResume`
 * - A frame that threw and was absorbed: `stepFailed`, `syncFailed`
 */
/* eslint-disable no-underscore-dangle */

/** Entries retained. Bounded so a multi-day Akhand Paatth cannot exhaust memory. */
const RING_SIZE = 4000;

export const traceScroll = (event, data = {}) => {
  if (typeof window === 'undefined' || !window.__akhandDebug) {
    return;
  }
  if (!window.__akhandLog) {
    window.__akhandLog = [];
  }
  const log = window.__akhandLog;
  log.push({ t: Math.round(performance.now()), event, ...data });
  if (log.length > RING_SIZE) {
    log.splice(0, log.length - RING_SIZE);
  }
};
