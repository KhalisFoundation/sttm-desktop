// Shadow data collection: the tester build handed to sangat members.
// It hides the Voice-Follow panel and runs Voice-Follow silently ("shadow mode") next to
// the sevadaar, who works by hand. What the sevadaar shows is the human label; what
// Voice-Follow would have shown is scored against it live (bus.js), and the audio and
// both timelines upload to the team's private bucket (uploader.js).
const SHADOW_BUILD = true;
// Opus in WebM at this bit rate is ~14 MB per hour and plenty for speech recognition.
const SHADOW_AUDIO_BPS = 32000;
// MediaRecorder hands over audio this often (ms); each piece is appended at once, so a
// crash or power cut loses at most this much.
const SHADOW_SLICE_MS = 5000;
// A new self-contained audio file this often; each finished one uploads within a minute,
// so a laptop dying mid-service loses at most a few minutes. Nobody has to quit the app.
const SHADOW_SEGMENT_MS = 2 * 60 * 1000;
// A session runs from the sevadaar's first screen change until they have made none for
// SHADOW_IDLE_STOP_MS; while words are still being heard it waits, up to the hard stop.
// (Scripted tests that feed audio with VF_TEST_WAV may shorten these.)
const testMs = (name, ms) =>
  process.env.VF_TEST_WAV && process.env[name] ? Number(process.env[name]) : ms;
const SHADOW_IDLE_STOP_MS = testMs('VF_TEST_IDLE_STOP_MS', 8 * 60 * 1000);
const SHADOW_IDLE_HARD_STOP_MS = testMs('VF_TEST_IDLE_HARD_STOP_MS', 20 * 60 * 1000);
const SHADOW_HEARD_GRACE_MS = testMs('VF_TEST_HEARD_GRACE_MS', 2 * 60 * 1000);
// Kirtan in the room starts a session even when nobody touches the laptop (listener.js):
// the room counts as sounding when loudness (RMS) stays above SHADOW_SOUND_LEVEL for
// SHADOW_SOUND_SHARE of SHADOW_SOUND_WINDOW_MS. A fan or an empty hall is ~0.001-0.003;
// a sound system through a laptop mic is well above 0.01.
const SHADOW_SOUND_LEVEL = 0.006;
const SHADOW_SOUND_WINDOW_MS = testMs('VF_TEST_SOUND_WINDOW_MS', 40 * 1000);
const SHADOW_SOUND_SHARE = 0.75;
// Every session begins with up to this much of the audio from before it started.
const SHADOW_PRE_ROLL_S = 120;
// A session ends once the room has been quiet (no sound and no words) this long and the
// screen has not changed for SHADOW_CHANGE_GRACE_MS. While kirtan plays it never ends.
const SHADOW_QUIET_STOP_MS = testMs('VF_TEST_QUIET_STOP_MS', 5 * 60 * 1000);
const SHADOW_CHANGE_GRACE_MS = testMs('VF_TEST_CHANGE_GRACE_MS', 2 * 60 * 1000);
// A session the room started (no sevadaar) where Voice-Follow was listening this long and
// recognised no words at all is noise, not kirtan: it is discarded, not uploaded.
const SHADOW_EMPTY_GATE_MS = testMs('VF_TEST_EMPTY_GATE_MS', 3 * 60 * 1000);
// After such a discard, sound alone does not start another session for this long (a
// screen change or Start still does), so a loud fan cannot keep restarting sessions.
const SHADOW_DISCARD_COOLDOWN_MS = testMs('VF_TEST_DISCARD_COOLDOWN_MS', 5 * 60 * 1000);
// Shadow scoring pauses while the computer is this busy (1-minute load per core) and
// resumes below SHADOW_CPU_RESUME, so a Gurdwara laptop never slows down for it.
const SHADOW_CPU_PAUSE = 0.9;
const SHADOW_CPU_RESUME = 0.6;
// Sessions upload straight to Khalis's Azure Blob container with a container SAS that only
// allows create, write and list. The SAS is never committed: after `npm run build`,
// packaging/inject-upload-sas.js replaces the placeholder in the compiled copy of this file
// from the VF_UPLOAD_SAS environment variable (CI sets it from a repository secret).
const UPLOAD_URL = 'https://banidb.blob.core.windows.net/voice-follow-training-data';
const UPLOAD_SAS = '__VF_UPLOAD_SAS__';
// A second copy of every session goes to Hugging Face in the team's recording layout
// (hf.js). The write token is entered on the first-launch card (kept in the app's settings)
// or, if Khalis chooses, injected at build time like the SAS (VF_HF_TOKEN).
const HF_NAMESPACE = 'khalisfoundation';
const HF_DATASET_TYPE = 'kirtan';
const HF_TOKEN = '__VF_HF_TOKEN__';

module.exports = {
  SHADOW_BUILD,
  SHADOW_AUDIO_BPS,
  SHADOW_SLICE_MS,
  SHADOW_SEGMENT_MS,
  SHADOW_IDLE_STOP_MS,
  SHADOW_IDLE_HARD_STOP_MS,
  SHADOW_HEARD_GRACE_MS,
  SHADOW_SOUND_LEVEL,
  SHADOW_SOUND_WINDOW_MS,
  SHADOW_SOUND_SHARE,
  SHADOW_PRE_ROLL_S,
  SHADOW_QUIET_STOP_MS,
  SHADOW_CHANGE_GRACE_MS,
  SHADOW_EMPTY_GATE_MS,
  SHADOW_DISCARD_COOLDOWN_MS,
  SHADOW_CPU_PAUSE,
  SHADOW_CPU_RESUME,
  UPLOAD_URL,
  UPLOAD_SAS,
  HF_NAMESPACE,
  HF_DATASET_TYPE,
  HF_TOKEN,
};
