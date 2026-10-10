// When a shadow session runs. Recording, logging and hidden Voice-Follow run whenever
// there is kirtan to collect, and not in an empty room:
//   start - at the first screen change after the app opens, when the sevadaar presses Start
//           in Voice-Follow, or when the room has been sounding for a while with nobody at
//           the laptop (listener.js)
//   stop  - once the room has been quiet (no sound and no recognised words) for
//           SHADOW_QUIET_STOP_MS and the screen has not changed for SHADOW_CHANGE_GRACE_MS;
//           while kirtan plays a session never stops on its own
//   empty - a session the room started is noise, and is discarded, when no words were
//           recognised at all: either Voice-Follow listened for SHADOW_EMPTY_GATE_MS, or the
//           room went quiet first. (One where Voice-Follow could not listen, e.g. paused
//           for a busy computer, and that ran past the gate is kept: better extra data.)
// Each start is a new session folder, uploaded as soon as it stops.
const { SHADOW_QUIET_STOP_MS, SHADOW_CHANGE_GRACE_MS, SHADOW_EMPTY_GATE_MS } = require('./config');

// Should a session that is ending be thrown away rather than uploaded?
function discardOnStop({ now, startedAt, startedBy, lastHeardAt, vfUpAt }) {
  if (startedBy !== 'sound' || lastHeardAt != null) return false;
  if (vfUpAt != null) return true; // Voice-Follow listened and heard nothing
  return now - (startedAt || now) < SHADOW_EMPTY_GATE_MS; // too short to be worth keeping
}

// The sevadaar changed what is on screen (not the state the app opened with).
const shouldStart = (prevKey, key) => prevKey != null && key !== prevKey;

// Why the session should stop now, or null to keep going. Times are ms since epoch.
function stopReason({ now, startedAt, startedBy, lastChangeAt, lastHeardAt, lastSoundAt, vfUpAt }) {
  if (
    startedBy === 'sound' &&
    lastHeardAt == null &&
    vfUpAt != null &&
    now - vfUpAt >= SHADOW_EMPTY_GATE_MS
  ) {
    return 'no_words';
  }
  const lastLife = Math.max(startedAt || 0, lastHeardAt || 0, lastSoundAt || 0);
  if (now - lastLife < SHADOW_QUIET_STOP_MS) return null;
  if (now - (lastChangeAt || 0) < SHADOW_CHANGE_GRACE_MS) return null;
  return 'quiet';
}

module.exports = { shouldStart, stopReason, discardOnStop };
