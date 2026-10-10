// Shadow bus: the two timelines of a shadow session, written as they happen.
//   human  - what the sevadaar put on screen (the label), from ShadowCollector
//   system - what Voice-Follow would have shown, from VoiceFollow in shadow mode
//   activity / events - loudness and words heard each second; pauses, sleep gaps
// The live score is score.js run on these same files every SAVE_S, the exact code the
// offline benchmark runs. Nothing here touches the screen.
const fs = require('fs');
const path = require('path');
const { SHADOW_SOUND_LEVEL } = require('./config');
const { contentKey, scoreDir, C } = require('./score');

const SAVE_S = 30;

const blankLabel = () => ({ key: null, verseId: null });
let S = null; // current session

const now = () => (S ? (Date.now() - S.t0) / 1000 : 0);
const writeLine = (file, obj) => {
  if (!S) return;
  try {
    fs.appendFileSync(path.join(S.dir, file), `${JSON.stringify(obj)}\n`);
  } catch (_) {
    /* never disturb the sevadaar */
  }
};

function save() {
  if (!S) return;
  try {
    const r = scoreDir(S.dir);
    delete r.segments;
    fs.writeFileSync(
      path.join(S.dir, 'score.json'),
      JSON.stringify({ updatedAt: new Date().toISOString(), ...r }, null, 1),
    );
  } catch (_) {
    /* best effort */
  }
}

function flushActivity(upTo) {
  // One line per finished second: loudest level (RMS 0-1), most letters heard, and the
  // longest recognised text (offline review compares it with each shabad's words).
  while (S.act.sec < upTo) {
    writeLine('activity.jsonl', {
      t: S.act.sec,
      level: Math.round(S.act.level * 1000) / 1000,
      letters: S.act.letters,
      text: S.act.text,
    });
    S.act = { sec: S.act.sec + 1, level: 0, letters: 0, text: '' };
  }
}

function tick() {
  if (!S) return;
  const t = now();
  // The clock jumped: the computer slept (lid closed). Those seconds are not scored.
  if (t - S.lastTick > C.GAP_S) writeLine('events.jsonl', { t, type: 'gap', from: S.lastTick });
  S.lastTick = t;
  flushActivity(Math.floor(t));
  if (t - S.lastSave >= SAVE_S) {
    S.lastSave = t;
    save();
  }
}

// ---- API ------------------------------------------------------------------
function begin(dir, t0) {
  // eslint-disable-next-line no-use-before-define
  end();
  S = {
    dir,
    t0,
    human: blankLabel(),
    system: blankLabel(),
    paused: false,
    lastSave: 0,
    lastTick: 0,
    lastHeardAt: null,
    lastSoundAt: null,
    vfUpAt: null,
    recentLevel: 0,
    act: { sec: 0, level: 0, letters: 0, text: '' },
    timer: setInterval(tick, 1000),
  };
}

function end() {
  if (!S) return;
  clearInterval(S.timer);
  tick();
  save();
  S = null;
}

// The sevadaar's screen changed (full label: shabadId, verseId, bani, ceremony, slide).
function human(label) {
  if (!S) return;
  S.human = { ...label, key: contentKey(label) };
  // While the sevadaar drives Voice-Follow (visible mode) the screen changes are mostly
  // Voice-Follow's own; one that differs from what it last showed is a sevadaar override.
  if (S.visible) {
    const sys = S.system || {};
    const same =
      contentKey(label) === contentKey(sys) && (label.verseId ?? null) === (sys.verseId ?? null);
    writeLine('human.jsonl', { t: now(), ...label, override: !same });
    return;
  }
  writeLine('human.jsonl', { t: now(), ...label });
}

// What Voice-Follow would show changed (partial update: shabadId / verseId / slide).
function system(update) {
  if (!S) return;
  const next = { ...S.system, ...update };
  if (update.shabadId != null) {
    next.slide = null;
    next.bani = null;
  }
  if (update.bani != null) {
    next.slide = null;
    next.shabadId = null;
  }
  S.system = next;
  writeLine('system.jsonl', { t: now(), ...update });
}

// Microphone loudness (RMS 0-1), sampled several times a second by the collector.
function level(rms) {
  if (!S) return;
  if (rms > S.act.level) S.act.level = rms;
  if (rms >= SHADOW_SOUND_LEVEL) S.lastSoundAt = Date.now();
  // Loudness over the last few seconds (recognition lags the audio a little).
  S.recentLevel = Math.max(rms, (S.recentLevel || 0) * 0.94);
}

// Text of the latest recognised window ('' = nothing recognisable was heard).
// A quiet room still makes the recognizer emit nonsense letters, so words only count as
// heard when the room is loud as well (the scorer uses the same pair of conditions).
const HEARD_LETTERS_MIN = 6;
const HEARD_LEVEL_MIN = 0.003;
function heard(text) {
  const letters = text.replace(/\s+/g, '').length;
  if (S && letters >= HEARD_LETTERS_MIN && (S.recentLevel || 0) >= HEARD_LEVEL_MIN) {
    S.lastHeardAt = Date.now();
  }
  if (S && letters > S.act.letters) {
    S.act.letters = letters;
    S.act.text = text.trim();
  }
}

// A health or status event from the hidden Voice-Follow (vf_up / vf_down).
function note(obj) {
  // When the hidden Voice-Follow came up (it can recognise words from then on).
  if (S && obj && obj.type === 'vf_up' && S.vfUpAt == null) S.vfUpAt = Date.now();
  writeLine('events.jsonl', { t: now(), ...obj });
}

// The sevadaar started (true) or stopped (false) Voice-Follow from the panel.
function setVisible(on) {
  if (!S || !!S.visible === !!on) return;
  S.visible = !!on;
  writeLine('events.jsonl', { t: now(), type: on ? 'vf_visible' : 'vf_hidden' });
}

function setPaused(paused) {
  if (!S || S.paused === paused) return;
  S.paused = paused;
  writeLine('events.jsonl', { t: now(), type: paused ? 'paused' : 'resumed' });
}

const active = () => !!S;
// When words were last heard (ms since epoch), or null.
const lastHeardAt = () => (S ? S.lastHeardAt || null : null);
const lastSoundAt = () => (S ? S.lastSoundAt || null : null);
const vfUpAt = () => (S ? S.vfUpAt || null : null);
const sessionDir = () => (S ? S.dir : null);

module.exports = {
  begin,
  end,
  human,
  system,
  level,
  heard,
  setPaused,
  setVisible,
  note,
  active,
  lastHeardAt,
  lastSoundAt,
  vfUpAt,
  sessionDir,
  contentKey,
};
