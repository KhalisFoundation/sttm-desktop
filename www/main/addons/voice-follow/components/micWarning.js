// Wrong-microphone hints for the sevadaar's Autopilot panel (never a sangat-facing screen).
// Fleet logs showed Gurdwara Sahibs listening through a phone-as-webcam virtual mic (level
// 0.000, nothing heard for 40 min) or a weak laptop mic (words heard 4% of the time), while
// the sevadaar did everything by hand. Three calm hints:
//   virtual : the chosen input's name looks like a virtual / loopback device
//   silent  : the input has given no sound for ~20 s while Autopilot runs
//   quiet   : ~3 min of a low (non-zero) level with words heard very rarely
// Pure logic only (no DOM, no audio), so it is unit-tested; VoiceFollow.jsx wires it up.

// Names of inputs that are usually not a real microphone in the hall: phone-as-webcam apps,
// virtual cables, loopback / screen-capture inputs, meeting-app virtual devices.
const VIRTUAL_PATTERNS = [
  ['Iriun', /\biriun\b/i],
  ['DroidCam', /droid\s*cam/i],
  ['Camo', /\bcamo\b/i],
  ['EpocCam', /epoc\s*cam/i],
  ['OBS', /\bobs\b/i],
  ['VB-Audio', /\bvb-?(audio|cable)\b|voicemeeter/i],
  ['Stereo Mix', /stereo\s*mix|what\s*u\s*hear|wave\s*out\s*mix/i],
  ['NVIDIA Broadcast', /nvidia\s*broadcast|rtx\s*voice/i],
  // Meeting-app devices only: a Zoom H-series recorder or L-series mixer is a real input.
  ['Zoom', /zoom\s*audio\s*device|zoomaudiodevice/i],
  ['Teams', /microsoft\s*teams\s*audio/i],
  ['BlackHole', /blackhole/i],
  ['Loopback', /loopback|soundflower/i],
  ['Virtual', /\bvirtual\b/i],
];

// The kind of virtual input a device name looks like ('Iriun', 'Virtual', ...), else null.
function virtualMicKind(label) {
  const name = String(label || '');
  if (!name) return null;
  const hit = VIRTUAL_PATTERNS.find(([, re]) => re.test(name));
  return hit ? hit[0] : null;
}

const DEFAULTS = {
  windowMs: 250, // one sample per volume window
  silentRms: 0.0005, // VOL_SILENT_RMS: below this nothing reaches the app
  goodRms: 0.004, // VOL_GOOD_RMS: below this the level reads "low"
  silentMs: 20000, // no sound for this long -> 'silent'
  quietMs: 180000, // this long of low level with few words -> 'quiet'
  quietHeardFrac: 0.05, // words heard in under 5% of the windows counts as "very little"
};

// The 80th percentile, as the panel's volume label reads loudness (pauses don't pull it down).
const p80 = (xs) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(0.8 * (sorted.length - 1))];
};

// A watcher fed one sample per volume window: { rms, heard } where heard says confident
// words arrived since the last sample. Returns the hint to show now: 'silent', 'quiet' or null.
// reset() when the input changes or a session starts.
function createMicWatch(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const silentN = Math.ceil(o.silentMs / o.windowMs);
  const quietN = Math.ceil(o.quietMs / o.windowMs);
  let rmsHist = []; // last silentN levels
  let quietHist = []; // last quietN { rms, heard }
  let heardCount = 0;
  let state = null;
  const api = {
    reset() {
      rmsHist = [];
      quietHist = [];
      heardCount = 0;
      state = null;
    },
    state: () => state,
    push({ rms, heard }) {
      const r = Number.isFinite(rms) ? rms : 0;
      rmsHist.push(r);
      if (rmsHist.length > silentN) rmsHist.shift();
      quietHist.push({ rms: r, heard: !!heard });
      if (heard) heardCount += 1;
      if (quietHist.length > quietN) {
        const old = quietHist.shift();
        if (old.heard) heardCount -= 1;
      }
      // Silent: the whole last ~20 s reads "no sound". It clears as soon as sound returns.
      const silentNow = rmsHist.length >= silentN && p80(rmsHist) < o.silentRms;
      // Quiet: ~3 min of a low but present level, and words heard very rarely.
      let quietNow = false;
      if (!silentNow && quietHist.length >= quietN) {
        const level = p80(quietHist.map((x) => x.rms));
        quietNow =
          level >= o.silentRms && level < o.goodRms && heardCount < o.quietHeardFrac * quietN;
      }
      if (silentNow) state = 'silent';
      else if (quietNow) state = 'quiet';
      else if (state === 'quiet' && quietHist.length >= quietN) {
        // Leave 'quiet' only once the level is good or words come through often again.
        const level = p80(quietHist.map((x) => x.rms));
        if (level >= o.goodRms || heardCount >= 2 * o.quietHeardFrac * quietN) state = null;
      } else state = null;
      return state;
    },
  };
  return api;
}

// From a short probe of the other inputs ([{ deviceId, label, rms }]), the one clearly picking
// up sound: level at least "good", the loudest. Virtual inputs are never offered (a Stereo Mix
// with sound is the computer's own playback, not the hall).
function pickProbedMic(results, opts = {}) {
  const goodRms = opts.goodRms || DEFAULTS.goodRms;
  const sounding = (results || []).filter(
    (r) => r && Number.isFinite(r.rms) && r.rms >= goodRms && !virtualMicKind(r.label),
  );
  if (!sounding.length) return null;
  sounding.sort((a, b) => b.rms - a.rms);
  return sounding[0];
}

// One dismissal per hint kind and device for as long as the panel lives.
const dismissKey = (kind, deviceId, label) => `${kind}:${deviceId || label || ''}`;

module.exports = { virtualMicKind, createMicWatch, pickProbedMic, dismissKey, MIC_WATCH: DEFAULTS };
