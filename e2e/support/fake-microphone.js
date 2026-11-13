// A microphone for the voice-search tests: Chromium's fake audio device,
// fed from a WAV file. The recording goes to the transcription service as a
// real one would, so the clip is a quiet tone, not speech: the recognition
// itself is the tester's case.
const fs = require('fs');
const path = require('path');

/** Writes a mono 16-bit WAV of `seconds` of a soft tone and returns its path. */
function writeToneWav(directory, seconds = 20, hertz = 220) {
  const sampleRate = 16000;
  const samples = sampleRate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const amplitude = 0.2 * Math.sin((2 * Math.PI * hertz * i) / sampleRate);
    data.writeInt16LE(Math.round(amplitude * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const file = path.join(directory, 'microphone.wav');
  fs.writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

/** Chromium switches that make `wav` the only microphone. */
function fakeMicrophoneArgs(wav) {
  return [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
  ];
}

module.exports = { fakeMicrophoneArgs, writeToneWav };
