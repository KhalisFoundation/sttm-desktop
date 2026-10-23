// Anonymous usage events from Voice Autopilot, through STTM's own analytics (analytics.js in
// the main process, sent to Aptabase). They fire for every user of the build, whatever their
// recording choice, so Autopilot use is visible even where no session is ever uploaded.
//
// What goes out: an event name, the category `vf-<VF_FEATURE_VERSION>`, a short label of
// enums and coarse counts, and a number. Never audio, Gurbani text, Shabad/Bani ids, names
// or ids of any kind. Clicks are never sent one by one: they are counted into the session
// summary (and a heartbeat every 15 minutes). Corrections are sampled, errors sent once per
// kind per app run, so a run sends well under ~10 events an hour. The "Collect statistics"
// setting (userSettings.statistics) turns all of it off. Nothing here can throw into Autopilot.
const { VF_FEATURE_VERSION } = require('../shadow/config');

const CATEGORY = `vf-${VF_FEATURE_VERSION}`;
const ERROR_KINDS = [
  'model_load_failed',
  'mic_blocked',
  'mic_failed',
  'engine_init_failed',
  'retrieval_prepare_failed',
  'retrieval_search_failed',
];
// A manual change this soon after an Autopilot choice corrects it (score.js C.VERDICT_S, the
// same window the recorded sessions are scored with).
const VERDICT_S = 20;
const HEARTBEAT_MS = 15 * 60 * 1000;
const CORRECTION_GAP_MS = 2 * 60 * 1000; // vf_correction: at most one per 2 minutes...
const CORRECTION_PER_HOUR = 5; // ...and at most this many an hour
const MODES = ['kirtan', 'paath', 'bani'];
const TIERS = ['fast', 'lean', 'min'];

// An unknown kind is reported as `other`, so a label can never carry free text.
const errorKind = (kind) => (ERROR_KINDS.includes(kind) ? kind : 'other');

const clampInt = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 9999) : 0;
};
const minutes = (ms) => Math.round(Math.max(0, ms) / 6000) / 10; // one decimal
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// The mode a run was mostly in (>= 80% of the followed time), else mixed; none if nothing.
const dominantMode = (modeMs = {}) => {
  const total = MODES.reduce((a, m) => a + (modeMs[m] || 0), 0);
  if (!total) return 'none';
  const top = MODES.reduce((a, m) => ((modeMs[m] || 0) > (modeMs[a] || 0) ? m : a), MODES[0]);
  return modeMs[top] / total >= 0.8 ? top : 'mixed';
};

// The coarse summary of one Autopilot run (Start to Stop), packed into a short label. Every
// field is a clamped number or a fixed word (see the PR description for the key list).
function summaryLabel(s = {}) {
  const parts = [
    `ap_min=${minutes(s.autoMs)}`,
    `sev_min=${minutes(s.sevMs)}`,
    `ap_shabad=${clampInt(s.autoShabad)}`,
    `ap_pangti=${clampInt(s.autoPangti)}`,
    `sev_shabad=${clampInt(s.manualShabad)}`,
    `sev_pangti=${clampInt(s.manualPangti)}`,
    `fix_shabad=${clampInt(s.fixShabad)}`,
    `fix_pangti=${clampInt(s.fixPangti)}`,
    `taps=${clampInt(s.taps)}`,
    `presses=${clampInt(s.presses)}`,
  ];
  const auto = clampInt(s.autoShabad);
  if (auto) {
    const acc = Math.round((100 * Math.max(0, auto - clampInt(s.fixShabad))) / auto);
    parts.push(`acc=${acc}`);
  }
  const med = median(s.fixDelays || []);
  if (med != null) parts.push(`fix_med_s=${clampInt(med)}`);
  parts.push(`shabads=${clampInt(s.shabads)}`, `switches=${clampInt(s.switches)}`);
  parts.push(`mode=${dominantMode(s.modeMs)}`);
  parts.push(`tier=${TIERS.includes(s.tier) ? s.tier : 'na'}`);
  if (s.passMs != null && Number.isFinite(Number(s.passMs))) {
    parts.push(`pass=${Math.round(clampInt(s.passMs) / 10) * 10}`);
  }
  if (s.backlogPeak != null && Number.isFinite(Number(s.backlogPeak))) {
    parts.push(`backlog=${Math.round(Math.min(99, Math.max(0, s.backlogPeak)) * 10) / 10}`);
  }
  return parts.join(';');
}

// One Autopilot run, from Start to Stop: counts only, never what was shown.
//   lock(id, kind)  - a Shabad/Bani Autopilot locked (kind: lock|switch|return|override|...)
//   auto(change)    - Autopilot changed the screen ('shabad' or 'pangti')
//   manual(change)  - the sevadaar changed it; returns { kind, afterS } when that corrected an
//                     Autopilot choice made within VERDICT_S, else null
//   tap()           - a candidate / "Changing to" card tapped
//   mode(name, ms)  - ms spent following in kirtan | paath | bani
//   perf({...})     - tier, model pass ms, audio backlog peak (s)
function createRunStats({ how = 'cold', now = Date.now, verdictS = VERDICT_S } = {}) {
  const at = now();
  const s = {
    how,
    at,
    started: false,
    lockAt: null,
    beatAt: at,
    shabadIds: new Set(),
    baniIds: new Set(),
    switches: 0,
    autoShabad: 0,
    autoPangti: 0,
    manualShabad: 0,
    manualPangti: 0,
    fixShabad: 0,
    fixPangti: 0,
    taps: 0,
    fixDelays: [],
    autoMs: 0,
    sevMs: 0,
    modeMs: {},
    tier: null,
    passMs: null,
    backlogPeak: 0,
  };
  let driver = 'auto';
  let driverAt = at;
  let lastAuto = null; // { t, shabad } the latest Autopilot choice not yet judged
  let lastAutoShabad = null; // time of the latest Autopilot Shabad/Bani choice not yet judged
  const drive = (who) => {
    const t = now();
    if (driver === 'auto') s.autoMs += t - driverAt;
    else s.sevMs += t - driverAt;
    driver = who;
    driverAt = t;
  };
  return {
    state: s,
    lock(id, kind, isBani) {
      if (id == null) return null;
      (isBani ? s.baniIds : s.shabadIds).add(String(id));
      if (kind === 'switch' || kind === 'return') s.switches += 1;
      if (s.lockAt != null) return null;
      s.lockAt = now();
      return Math.round((s.lockAt - at) / 100) / 10;
    },
    auto(change) {
      const t = now();
      drive('auto');
      if (change === 'shabad') {
        s.autoShabad += 1;
        lastAutoShabad = t;
      } else s.autoPangti += 1;
      lastAuto = { t, shabad: change === 'shabad' };
    },
    manual(change) {
      const t = now();
      drive('sevadaar');
      let fix = null;
      if (change === 'shabad') {
        s.manualShabad += 1;
        if (lastAutoShabad != null && t - lastAutoShabad <= verdictS * 1000) {
          s.fixShabad += 1;
          fix = { kind: 'shabad', afterS: Math.round((t - lastAutoShabad) / 100) / 10 };
        }
      } else {
        s.manualPangti += 1;
        if (lastAuto && t - lastAuto.t <= verdictS * 1000) {
          s.fixPangti += 1;
          fix = { kind: 'pangti', afterS: Math.round((t - lastAuto.t) / 100) / 10 };
        }
      }
      if (fix) {
        s.fixDelays.push(fix.afterS);
        lastAuto = null; // one Autopilot choice is corrected at most once
        if (fix.kind === 'shabad') lastAutoShabad = null;
      }
      return fix;
    },
    tap() {
      s.taps += 1;
      drive('sevadaar');
    },
    mode(name, ms) {
      if (MODES.includes(name) && ms > 0) s.modeMs[name] = (s.modeMs[name] || 0) + ms;
    },
    perf({ tier, passMs, backlogPeak } = {}) {
      if (tier) s.tier = tier;
      if (passMs != null) s.passMs = passMs;
      if (backlogPeak != null && backlogPeak > s.backlogPeak) s.backlogPeak = backlogPeak;
    },
    minutes: () => minutes(now() - at),
    // Due for a heartbeat (every HEARTBEAT_MS while the run lasts)? Marks it sent.
    beatDue() {
      if (now() - s.beatAt < HEARTBEAT_MS) return false;
      s.beatAt = now();
      return true;
    },
    label(presses) {
      drive(driver); // bring the driving time up to now
      return summaryLabel({
        ...s,
        presses,
        shabads: s.shabadIds.size + s.baniIds.size,
      });
    },
  };
}

// The sender: STTM's global Analytics instance in the main process (app.js), the same one
// controller.js and menu.js use. Looked up lazily so unit tests never load Electron.
const defaultSend = (payload) => {
  // eslint-disable-next-line global-require
  const remote = require('@electron/remote');
  const analytics = remote.getGlobal('analytics');
  if (analytics) analytics.trackEvent(payload);
};

function createVfAnalytics({ send = defaultSend, now = Date.now } = {}) {
  let allowed = true;
  const sentOnce = new Set();
  const sampled = new Map(); // key -> times sent (ms)
  const track = (action, { label = '', value = '' } = {}) => {
    try {
      if (!allowed) return false;
      send({ category: CATEGORY, action, label: String(label).slice(0, 250), value });
      return true;
    } catch (_) {
      return false; // analytics must never break Autopilot
    }
  };
  // Once per key per app run (an error kind, the recording choice).
  const once = (key, action, fields) => {
    if (sentOnce.has(key)) return false;
    sentOnce.add(key);
    return track(action, fields);
  };
  // At most one per gapMs and perHour per key; the rest are dropped (they are still counted
  // in the session summary).
  const sample = (key, action, fields, { gapMs, perHour }) => {
    const t = now();
    const times = (sampled.get(key) || []).filter((x) => t - x < 3600000);
    if (times.length >= perHour || (times.length && t - times[times.length - 1] < gapMs)) {
      sampled.set(key, times);
      return false;
    }
    times.push(t);
    sampled.set(key, times);
    return track(action, fields);
  };
  return {
    // The user's "Collect statistics" setting; anything but an explicit false allows.
    setAllowed: (on) => {
      allowed = on !== false;
    },
    track,
    once,
    sample,
    correction: (fix) =>
      fix
        ? sample(
            'correction',
            'vf_correction',
            { label: fix.kind, value: fix.afterS },
            {
              gapMs: CORRECTION_GAP_MS,
              perHour: CORRECTION_PER_HOUR,
            },
          )
        : false,
    error: (kind, where = '') => {
      const k = errorKind(kind);
      const label = where ? `${k};run=${where}` : k;
      return once(`error:${k}`, 'vf_error', { label });
    },
  };
}

// One instance for the whole renderer (VoiceFollow.jsx and ShadowCollector.jsx share it).
const vfAnalytics = createVfAnalytics();

module.exports = {
  vfAnalytics,
  createVfAnalytics,
  createRunStats,
  summaryLabel,
  dominantMode,
  errorKind,
  CATEGORY,
  ERROR_KINDS,
  VERDICT_S,
  HEARTBEAT_MS,
};
