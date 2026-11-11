// Wrong-microphone logic for the sevadaar's Autopilot panel (MicWarnings.jsx). Pure functions,
// unit-tested in micWarning.test.js.

const O = {
  windowMs: 250, // one level per volume window
  silentRms: 0.0005, // VOL_SILENT_RMS: below this nothing reaches the app
  goodRms: 0.004, // VOL_GOOD_RMS: below this the level reads "low"
  silentMs: 20000, // no sound this long -> 'silent'
  quietMs: 180000, // this long of a low level with words almost never heard -> 'quiet'
  quietHeardFrac: 0.05,
  hearMs: 4000, // the "Hearing" dot reads the last 4 s
  pauseMs: Infinity, // no sound this long -> auto-pause (once)
};
const p80 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(0.8 * (xs.length - 1))] || 0;

// Fed one { rms, heard, now } per window (heard: confident words since the last window).
// push() returns { hint: 'silent' | 'quiet' | null, pause: true once when it is time to pause }.
function createMicWatch(opts = {}) {
  const o = { ...O, ...opts };
  const n = (ms) => Math.ceil(ms / o.windowMs);
  let hist = []; // { rms, heard } for the last quietMs
  let hint = null;
  let quietSince = null;
  let paused = false;
  const last = (ms) => hist.slice(-n(ms)).map((x) => x.rms);
  return {
    reset() {
      hist = [];
      hint = null;
      quietSince = null;
      paused = false;
    },
    silentMs: (now) => (quietSince == null ? 0 : now - quietSince),
    // true / false over the last few seconds; null in the first second.
    hearing: () => (hist.length < 4 ? null : p80(last(o.hearMs)) >= o.silentRms),
    push({ rms, heard, now = 0 }) {
      const r = Number.isFinite(rms) ? rms : 0;
      hist.push({ rms: r, heard: !!heard });
      if (hist.length > n(o.quietMs)) hist.shift();
      const silent = hist.length >= n(o.silentMs) && p80(last(o.silentMs)) < o.silentRms;
      const full = hist.length >= n(o.quietMs);
      const level = full ? p80(last(o.quietMs)) : 0;
      const heardN = hist.filter((x) => x.heard).length;
      const few = heardN < o.quietHeardFrac * n(o.quietMs);
      if (silent) hint = 'silent';
      else if (full && level >= o.silentRms && level < o.goodRms && few) hint = 'quiet';
      // Leave 'quiet' only once the level is good or words come through often again.
      else if (
        hint !== 'quiet' ||
        level >= o.goodRms ||
        heardN >= 2 * o.quietHeardFrac * n(o.quietMs)
      )
        hint = null;
      if (r >= o.silentRms) quietSince = null;
      else if (quietSince == null) quietSince = now;
      const pause = !paused && quietSince != null && now - quietSince >= o.pauseMs;
      if (pause) paused = true;
      return { hint, pause };
    },
  };
}

// Minutes of no sound before Autopilot pauses itself; VF_AUTOPAUSE_MIN overrides it for tests.
const autoPauseMinutes = (env) => {
  const v = Number(env && env.VF_AUTOPAUSE_MIN);
  return v > 0 ? v : 30;
};

// The probed input clearly picking up sound (level at least "good"), the loudest; else null.
const pickProbedMic = (results, goodRms = O.goodRms) =>
  (results || []).filter((r) => r.rms >= goodRms).sort((a, b) => b.rms - a.rms)[0] || null;

// The best input other than `exclude` that is not a wrong kind: mixer, then built-in, then any.
const RANK = { mixer: 0, laptop: 1 };
function bestOtherMic(list, exclude, { kindOf, isWrong }) {
  const ok = (list || []).filter((d) => d.deviceId !== exclude && !isWrong(d.label));
  const rank = (d) => RANK[kindOf(d.label)] ?? 2;
  return ok.reduce((b, d) => (!b || rank(d) < rank(b) ? d : b), null);
}

// Without a saved choice: the system default, unless its name looks wrong and another input
// exists (field logs: every silent session ran on a default like "Iriun Webcam #4" while
// "Wireless Microphone" sat unused). { device, avoided } (avoided: the default passed over).
function pickDefaultMic(list, def, kinds) {
  const best = def && kinds.isWrong(def.label) ? bestOtherMic(list, def.deviceId, kinds) : null;
  return best ? { device: best, avoided: def } : { device: def || null, avoided: null };
}

// A friendly name for the warning lines (display only): drops "Default - ", "Microphone (X)" /
// "Line In (X)" / "Headset (X)" wrappers, USB ids "(3547:0407)", "(Virtual)" and "(Built-in)".
const WRAP = /^(?:microphone|line in|headset|headset microphone)\s*\((.+)\)$/i;
const TAIL = /\s*\((?:[0-9a-f]{4}:[0-9a-f]{4}|virtual|built-?in)\)\s*$/i;
function friendlyMicName(label, keepBuiltIn = false) {
  let s = String(label || '')
    .trim()
    .replace(/^(?:default|communications)\s+-\s+/i, '');
  for (let prev = ''; s !== prev;) {
    prev = s;
    if (!(keepBuiltIn && /\(built-?in\)\s*$/i.test(s))) s = s.replace(TAIL, '');
    s = s.replace(WRAP, '$1').trim();
  }
  return s;
}

// Friendly names for a list (Map deviceId -> name); two that would read the same keep
// "(Built-in)", then get a number.
function friendlyMicNames(list) {
  const items = (list || []).map((d) => [d, friendlyMicName(d.label)]);
  const dupe = (xs, name) => xs.filter(([, x]) => x === name).length > 1;
  const named = items.map(([d, x]) => [d, dupe(items, x) ? friendlyMicName(d.label, true) : x]);
  const seen = {};
  return new Map(
    named.map(([d, x]) => {
      seen[x] = (seen[x] || 0) + 1;
      return [d.deviceId, dupe(named, x) && seen[x] > 1 ? `${x} (${seen[x]})` : x];
    }),
  );
}

module.exports = {
  createMicWatch,
  autoPauseMinutes,
  pickProbedMic,
  bestOtherMic,
  pickDefaultMic,
  friendlyMicName,
  friendlyMicNames,
};
