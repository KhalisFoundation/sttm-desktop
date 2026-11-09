// Opens the microphone the sevadaar chose on the Voice Follow start screen, so the Shadower
// records what the recognizer hears. Before this, the Shadower asked for the system default
// device: with a phone-as-webcam or remote-desktop input chosen in the app, the default device
// was something else, and whole sessions were saved as silence while the recognizer heard fine.
const MIC_PREF_KEY = 'vf-mic-device'; // same key the start screen saves (VoiceFollow.jsx)
const AUDIO = { channelCount: 1, echoCancellation: false, noiseSuppression: false };

function chosenMicId() {
  try {
    return window.localStorage.getItem(MIC_PREF_KEY) || '';
  } catch (e) {
    return '';
  }
}

// Resolves to a mono stream from the chosen microphone; falls back to the system default
// only when that device is gone (unplugged), exactly as the recognizer does.
async function openMic() {
  const wanted = chosenMicId();
  if (!wanted) return navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { ...AUDIO, deviceId: { exact: wanted } },
    });
  } catch (e) {
    const gone = e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError');
    if (!gone) throw e;
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  }
}

module.exports = { openMic, chosenMicId, MIC_PREF_KEY };
