// Waheguru Simran (no app state; unit-tested in simran.test.js): the sangat or the ragi repeating
// ਵਾਹਿਗੁਰੂ, which is not a pangti to follow. Used by the not-Gurbani slide in VoiceFollow.jsx.
// Only a long run of it counts: ਵਾਹਿਗੁਰੂ is also in Gurbani (the Bhatt Swaiye's refrain is
// ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਵਾਹਿ ਜੀਉ), so VoiceFollow also needs nothing to fit the Shabad on screen.
/* eslint-disable no-param-reassign */ // s: the slide's own state, updated in place
const WAHEGURU = 'ਵਾਹਿਗੁਰੂ';
const SIMRAN_W = 20000; // what was heard over this window
const SIMRAN_MIN_HEARD = 10; // transcripts in the window before anything is judged
const SIMRAN_ON = 0.6; // this share of the transcripts have a Waheguru: Simran
const SIMRAN_OFF = 0.3; // under this share: not Simran
const SIMRAN_TRIG = 8000; // Simran this long: the slide goes up
const SIMRAN_END = 10000; // stopped this long: Simran is over (a short Dhan Guru line is not)
const SIMRAN_NOW_W = 6000; // 'heard right now' (the lock gate): the last few seconds only

const STRIP = /[\s।॥|0-9੦-੯.,;:!?-]+/g; // as the engine's norm (engine/infer.js)
const norm = (s) => (s || '').replace(STRIP, '');

// Edit distance, small strings only.
function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// A heard word that is ਵਾਹਿਗੁਰੂ, as the speech model may spell it (ਵਾਹਗੁਰੂ, ਵਾਹਿਗੁਰ, ਵਾਹਿੁਰ...).
const isWaheguru = (w) => {
  const n = norm(w);
  return n.length >= 5 && n.length <= 11 && dist(n, WAHEGURU) <= 2;
};

// Of these heard words, how many are Waheguru (ਵਾਹਿ ਗੁਰੂ heard as two words counts once).
function countSimran(words) {
  let hits = 0;
  let total = 0;
  for (let i = 0; i < words.length; i += 1) {
    total += 1;
    if (isWaheguru(words[i])) hits += 1;
    else if (
      i + 1 < words.length &&
      dist(norm(words[i]), 'ਵਾਹਿ') <= 1 && // only ਵਾਹਿ + ਗੁਰੂ, never another word + ਗੁਰੂ
      isWaheguru(words[i] + words[i + 1])
    ) {
      hits += 1;
      i += 1;
    }
  }
  return { hits, total };
}

// The Fateh said aloud (ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖ਼ਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ), as the speech model hears it
// (ਵਾਹਿਗੁਰ ਜੀ ਕਾ ਖਾਸਾ, ਵਹਿਗੁਰ ਚੀ ਕ ਖਾਲਸਾ, ਵਾਹਿਗੁਰ ਜੀ ਕੀ ਫਤਿਹ...): a Waheguru, then ਜੀ, then ਕਾ + a
// word in ਖ or ਕੀ + a word in ਫ/ਪ. In Gurbani only the headings say it (never sung or read as kirtan).
function fatehIn(text) {
  const w = String(text || '')
    .split(/\s+/)
    .map(norm)
    .filter(Boolean);
  for (let i = 0; i + 3 < w.length; i += 1) {
    if (
      isWaheguru(w[i]) &&
      /^[ਜਚ]ੀ$/.test(w[i + 1]) &&
      ((/^ਕਾ?$/.test(w[i + 2]) && /^[ਖ\u0A59]/.test(w[i + 3])) ||
        (w[i + 2] === 'ਕੀ' && /^[ਫਪ\u0A5E]/.test(w[i + 3])))
    )
      return true;
  }
  return false;
}

const createSimran = () => ({ heard: [], onSince: null, offSince: null, on: false, fatehAt: 0 });

// A recognizer transcript (its last few seconds of audio). Mis-heard spellings (ਵਹਿੁਰ, ਵਾਹਿ ਕਰ)
// and words in between (ਸਤਿ ਨਾਮ ਵਾਹਿਗੁਰੂ) are common, so what counts is how many transcripts
// have a Waheguru, not how many of the words are.
function noteHeard(s, now, text) {
  const { hits } = countSimran(
    String(text || '')
      .split(/\s+/)
      .filter(Boolean),
  );
  s.heard.push({ t: now, has: hits > 0 });
  if (fatehIn(text)) s.fatehAt = now;
  while (s.heard.length && now - s.heard[0].t > SIMRAN_W) s.heard.shift();
}

// Is Simran going on now: 'on', 'off' (clearly not), or null (unsure)?
function heardNow(s, now) {
  const w = s.heard.filter((x) => now - x.t <= SIMRAN_W);
  if (w.length < SIMRAN_MIN_HEARD) return 'off';
  const share = w.filter((x) => x.has).length / w.length;
  if (share >= SIMRAN_ON) return 'on';
  return share < SIMRAN_OFF ? 'off' : null;
}

// One step: 'start' (Simran for SIMRAN_TRIG), 'end' (stopped for SIMRAN_END), or null.
function simranStep(s, now) {
  const h = heardNow(s, now);
  if (h === 'on') {
    s.offSince = null;
    if (s.onSince == null) s.onSince = now;
    if (!s.on && now - s.onSince >= SIMRAN_TRIG) {
      s.on = true;
      return 'start';
    }
    return null;
  }
  s.onSince = null;
  if (h === 'off') {
    if (s.offSince == null) s.offSince = now;
    if (s.on && now - s.offSince >= SIMRAN_END) {
      s.on = false;
      return 'end';
    }
  }
  return null;
}

// Simran heard right now (the last SIMRAN_NOW_W): no first Shabad is opened over it. Short, so a
// Shabad sung after the Simran is found within seconds.
function simranNow(s, now) {
  const w = s.heard.filter((x) => now - x.t <= SIMRAN_NOW_W);
  return w.length >= 6 && w.filter((x) => x.has).length / w.length >= SIMRAN_ON;
}

module.exports = {
  isWaheguru,
  countSimran,
  fatehIn,
  createSimran,
  noteHeard,
  simranStep,
  simranNow,
};
