// Respect the sevadaar's line moves (pure; unit-tested in lineRespect.test.js).
//
// While Autopilot follows a Shabad or Bani, the sevadaar may move the line on the main
// screen (a pangti in the Shabad pane, the arrow keys, a controller). Autopilot must then
// carry on from THAT pangti instead of putting its own guess back. Three parts:
//   1. Tag: every line the app itself writes is remembered for a moment, so any other
//      change of the screen line (within the Shabad being followed) is the sevadaar's.
//   2. Adopt: the follower's position is set to the sevadaar's pangti (the caller does
//      that); the next pangti sung moves on from there.
//   3. Hold: for SEVADAAR_HOLD_MS after the move, the app writes a different line only
//      when the follower moves on to the next pangti, or when it insists on another
//      pangti strongly and for a while (stronger than a normal line move).

// How long the sevadaar's line is protected.
const SEVADAAR_HOLD_MS = 12000;
// A screen line equal to the app's latest write within this long is the app's own; an
// earlier write only within APP_WRITE_BURST_MS (one burst of store actions seen late). So a
// sevadaar who puts back the line the app has just left is still seen.
const APP_WRITE_GRACE_MS = 3000;
const APP_WRITE_BURST_MS = 500;
// During the hold, a pangti other than the next one needs the follower to stay on it
// (or keep moving forward from it) this long, in this many outputs in a row, each at
// least this confident.
const HOLD_MOVE_MS = 2500;
const HOLD_MOVE_OUTPUTS = 6;
const HOLD_MOVE_CONF = 0.6;
// An app line change this soon after a sevadaar move is logged against it.
const OVERRIDE_LOG_S = 10;

function createLineRespect() {
  let writes = []; // [{ verseId, at }]: lines the app wrote recently
  // { verseId, line, at, owner, streak: { dir, line, since, n } | null }; owner = the follower
  // the line was adopted into (a new Shabad / Bani gets a new follower and no hold).
  let hold = null;
  let lastMove = null; // { verseId, line, at, owner }: the latest sevadaar move, for the log

  const prune = (now) => {
    writes = writes.filter((w) => now - w.at <= APP_WRITE_GRACE_MS);
  };

  return {
    // The app put `verseId` on screen (or is about to).
    appWrote(verseId, now) {
      if (verseId == null) return;
      prune(now);
      writes.push({ verseId, at: now });
    },

    // The screen line changed to `verseId`. ctx: { now, following, sameShabad, known }
    // (known: the line belongs to what is being followed). Returns 'app', 'sevadaar' or
    // 'ignore' (nothing to do: no line, not following, or another Shabad / Bani).
    classify(verseId, { now, following, sameShabad, known }) {
      if (verseId == null) return 'ignore';
      prune(now);
      const last = writes[writes.length - 1];
      if (last && last.verseId === verseId) return 'app';
      if (writes.some((w) => w.verseId === verseId && now - w.at <= APP_WRITE_BURST_MS))
        return 'app';
      if (!following || !sameShabad || !known) return 'ignore';
      return 'sevadaar';
    },

    // The follower `owner` was moved to the sevadaar's line (index `line`), away from the
    // app's line `fromLine` (index, or -1).
    adopt(verseId, line, now, owner = null, fromLine = -1) {
      hold = { verseId, line, fromLine, at: now, owner, streak: null };
      lastMove = { verseId, line, fromLine, at: now, owner };
    },

    // May the app write the follower's line `out` ({ lineIndex, confidence }) now?
    // Without a hold this is always yes (behaviour unchanged).
    gate(out, now, owner = null) {
      if (hold && hold.owner !== owner) hold = null;
      if (!hold) return { write: true, reason: null };
      if (now - hold.at >= SEVADAAR_HOLD_MS) {
        hold = null;
        return { write: true, reason: 'expired' };
      }
      const line = out.lineIndex;
      if (line === hold.line) {
        hold.streak = null; // the follower agrees with the sevadaar
        return { write: true, reason: null };
      }
      // The next pangti is being sung: carry on from the sevadaar's line. Not when that is
      // the line the sevadaar just moved back from: that is the app's old guess.
      if (line === hold.line + 1 && line !== hold.fromLine) {
        hold = null;
        return { write: true, reason: 'next' };
      }
      // Anything else must be insisted on. Forward: steady progress past the next line
      // (fast reading) counts as one run; back: the same line every time.
      const dir = line > hold.line ? 'fwd' : 'back';
      const s = hold.streak;
      const strong = out.confidence >= HOLD_MOVE_CONF;
      const continues =
        s && s.dir === dir && (dir === 'fwd' ? line >= s.line : line === s.line) && strong;
      if (continues) {
        s.line = line;
        s.n += 1;
      } else {
        hold.streak = strong ? { dir, line, since: now, n: 1 } : null;
      }
      const st = hold.streak;
      if (st && st.n >= HOLD_MOVE_OUTPUTS && now - st.since >= HOLD_MOVE_MS) {
        hold = null;
        return { write: true, reason: 'strong' };
      }
      return { write: false, reason: 'hold' };
    },

    // The app wrote `verseId` (index `line`) as a line move. Returns the log record when this
    // is the first app move within OVERRIDE_LOG_S of a sevadaar move: kind 'next' (it moved
    // on to the pangti after the sevadaar's) or 'override' (anything else), else null.
    afterWrite(verseId, line, now, owner = null) {
      if (!lastMove) return null;
      const m = lastMove;
      if (m.owner !== owner || now - m.at > OVERRIDE_LOG_S * 1000) {
        lastMove = null;
        return null;
      }
      if (verseId === m.verseId) return null;
      lastMove = null;
      return {
        kind: line === m.line + 1 && line !== m.fromLine ? 'next' : 'override',
        from: m.verseId,
        to: verseId,
        afterS: Math.round((now - m.at) / 100) / 10,
      };
    },

    holding: () => !!hold,
    // A new Shabad / Bani, a new session or Stop: nothing carries over.
    reset() {
      hold = null;
      lastMove = null;
    },
  };
}

// The follower line that shows `verseId`, nearest the current cursor when it appears more
// than once (a repeated row). -1 when the line is not followed.
function lineOfVerse(verseIds, verseId, cursor) {
  let best = -1;
  (verseIds || []).forEach((v, i) => {
    if (v !== verseId) return;
    if (best < 0 || (cursor != null && Math.abs(i - cursor) < Math.abs(best - cursor))) best = i;
  });
  return best;
}

module.exports = {
  createLineRespect,
  lineOfVerse,
  SEVADAAR_HOLD_MS,
  APP_WRITE_GRACE_MS,
  APP_WRITE_BURST_MS,
  HOLD_MOVE_MS,
  HOLD_MOVE_OUTPUTS,
  HOLD_MOVE_CONF,
  OVERRIDE_LOG_S,
};
