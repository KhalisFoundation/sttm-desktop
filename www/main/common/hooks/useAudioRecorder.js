import { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';

const fs = require('fs');
const path = require('path');

// Converts float32 PCM samples in [-1, 1] to 16-bit signed integers
const floatTo16BitPCM = (input) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
};

// Linear-interpolation downsample from the mic's native rate to 16kHz
const resampleTo16k = (samples, inputSampleRate) => {
  if (inputSampleRate === 16000) {
    return samples;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const srcIndex = i * ratio;
    const idxLow = Math.floor(srcIndex);
    const idxHigh = Math.min(idxLow + 1, samples.length - 1);
    const frac = srcIndex - idxLow;
    result[i] = samples[idxLow] * (1 - frac) + samples[idxHigh] * frac;
  }
  return result;
};

const encodeWav = (int16Samples, sampleRate) => {
  const dataSize = int16Samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < int16Samples.length; i += 1) {
    buffer.writeInt16LE(int16Samples[i], 44 + i * 2);
  }
  return buffer;
};

export const useAudioRecorder = () => {
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);

  useEffect(() => {
    const startCapture = async () => {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
    };

    const stopCapture = (sessionId, folderPath) => {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const inputSampleRate = audioCtxRef.current ? audioCtxRef.current.sampleRate : 16000;
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }

      const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      chunksRef.current.forEach((c) => {
        merged.set(c, offset);
        offset += c.length;
      });
      chunksRef.current = [];

      const pcm16 = floatTo16BitPCM(resampleTo16k(merged, inputSampleRate));
      const wavBuffer = encodeWav(pcm16, 16000);

      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(path.join(folderPath, `${sessionId}.wav`), wavBuffer);
      ipcRenderer.send('recording-files-ready', { sessionId, folderPath });
    };

    const handleToggle = (_event, { isRecording, sessionId, folderPath }) => {
      if (isRecording) {
        startCapture();
      } else {
        stopCapture(sessionId, folderPath);
      }
    };

    ipcRenderer.on('recording-toggle', handleToggle);
    return () => ipcRenderer.removeListener('recording-toggle', handleToggle);
  }, []);
};
