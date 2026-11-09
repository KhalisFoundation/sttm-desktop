// The microphone the shadow recorder, its loudness meter and the pre-roll ear listen to: the
// one chosen for Voice Autopilot on its start screen (VoiceFollow.jsx MIC_PREF_KEY), so the
// audio saved and the level logged are what Voice Autopilot hears. Before this, they opened
// the system default, and on computers whose default is a silent virtual device (NDI Webcam
// Audio, Iriun Webcam, Splashtop Remote Sound) every session uploaded silence and logged
// level 0 while Voice Autopilot heard the room through the chosen input. No choice, or the
// chosen device gone: the system default, as before.
const MIC_PREF_KEY = 'vf-mic-device';
const AUDIO = { channelCount: 1, echoCancellation: false, noiseSuppression: false };

const chosenMicId = () => {
  try {
    return window.localStorage.getItem(MIC_PREF_KEY) || '';
  } catch (e) {
    return '';
  }
};

async function openMic() {
  const wanted = chosenMicId();
  if (wanted) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO, deviceId: { exact: wanted } },
      });
    } catch (e) {
      const gone = e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError');
      if (!gone) throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: AUDIO });
}

module.exports = { openMic, chosenMicId, MIC_PREF_KEY };
