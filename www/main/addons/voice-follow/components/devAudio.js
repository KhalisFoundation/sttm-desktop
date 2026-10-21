// Developer-only: VF_DEMO_WAV=<audio file> replaces the microphone with that recording (played
// silently, nothing reaches the speakers), so demos and end-to-end checks can run unattended.
// Never active unless the environment variable is set when the app starts.
const fs = require('fs');

function installDemoAudio() {
  const file = process.env.VF_DEMO_WAV;
  if (!file || !navigator.mediaDevices || window.vfDemoAudio) return;
  window.vfDemoAudio = { file, startedAt: null };
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let shared = null;
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c || !c.audio) return real(c);
    if (!shared) {
      shared = (async () => {
        const ctx = new AudioContext();
        const raw = fs.readFileSync(file);
        const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        const src = ctx.createBufferSource();
        src.buffer = await ctx.decodeAudioData(data);
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        // Keep producing (silent) frames after the file ends, like a real microphone.
        const silence = ctx.createConstantSource();
        silence.offset.value = 0;
        silence.connect(dest);
        silence.start();
        src.start();
        window.vfDemoAudio.startedAt = Date.now();
        return dest.stream;
      })();
    }
    const stream = await shared;
    return stream.clone();
  };
}

module.exports = { installDemoAudio };
