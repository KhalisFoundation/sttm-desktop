// When a shadow session runs. Recording, logging and hidden Voice-Follow only happen while
// the sevadaar is actually working, so a laptop left open all day does not produce hours
// of blank audio:
//   start - at the first screen change after the app opens (a shabad, a line, a slide)
//   stop  - SHADOW_IDLE_STOP_MS after the last screen change; while words are still being
//           heard (a long shabad with no line moves, katha with the shabad up) it waits,
//           up to SHADOW_IDLE_HARD_STOP_MS
// Each start is a new session folder, uploaded as soon as it stops.
const {
  SHADOW_IDLE_STOP_MS,
  SHADOW_IDLE_HARD_STOP_MS,
  SHADOW_HEARD_GRACE_MS,
} = require('./config');

// The sevadaar changed what is on screen (not the state the app opened with).
const shouldStart = (prevKey, key) => prevKey != null && key !== prevKey;

// Why the session should stop now, or null to keep going.
function stopReason({ now, lastChangeAt, lastHeardAt }) {
  const idle = now - lastChangeAt;
  if (idle < SHADOW_IDLE_STOP_MS) return null;
  if (idle >= SHADOW_IDLE_HARD_STOP_MS) return 'idle_hard_stop';
  if (lastHeardAt != null && now - lastHeardAt < SHADOW_HEARD_GRACE_MS) return null;
  return 'idle';
}

module.exports = { shouldStart, stopReason };
