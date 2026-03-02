export class SilenceDetector {
  constructor(analyser, callbacks, config = {}) {
    this.analyser = analyser;
    this.dataArray = null;
    this.rafId = null;
    this.silenceStartTime = null;
    this.hasDetectedAudio = false;
    this.onSilenceDetected = callbacks.onSilenceDetected;
    this.threshold = config.threshold ?? 0.03;
    this.durationMs = config.durationMs ?? 1500;

    // Initialize data array
    const fftSize = config.fftSize ?? 2048;
    if (analyser.fftSize !== fftSize) {
      // eslint-disable-next-line no-param-reassign
      analyser.fftSize = fftSize;
    }
    // eslint-disable-next-line no-param-reassign
    analyser.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.1;
    this.dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Bind checkAudioLevel to maintain 'this' context
    this.checkAudioLevel = this.checkAudioLevel.bind(this);
  }

  checkAudioLevel() {
    if (!this.analyser || !this.dataArray) return;

    // Web Audio API type definition issue with Uint8Array
    this.analyser.getByteTimeDomainData(this.dataArray);

    // RMS calculation
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const v = (this.dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    const isSilent = rms < this.threshold;
    const now = performance.now();

    if (!isSilent) {
      this.hasDetectedAudio = true;
      this.silenceStartTime = null;
    }

    if (this.hasDetectedAudio && isSilent) {
      if (this.silenceStartTime === null) {
        this.silenceStartTime = now;
      } else if (now - this.silenceStartTime >= this.durationMs) {
        this.onSilenceDetected();
        this.stop();
        return;
      }
    }

    if (this.rafId !== null) {
      this.rafId = requestAnimationFrame(this.checkAudioLevel);
    }
  }

  start() {
    if (!this.analyser || this.rafId !== null) return;

    // Reset state
    this.silenceStartTime = null;
    this.hasDetectedAudio = false;

    // Ensure data array is properly sized
    if (!this.dataArray || this.dataArray.length !== this.analyser.frequencyBinCount) {
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    this.rafId = requestAnimationFrame(this.checkAudioLevel);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.silenceStartTime = null;
    this.hasDetectedAudio = false;
  }

  destroy() {
    this.stop();
    this.analyser = null;
    this.dataArray = null;
  }
}

// Helper function to create audio context and analyser from a stream
export function createAudioAnalyser(stream, config = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  const audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = config.fftSize ?? 2048;
  analyser.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.1;
  source.connect(analyser);

  return { audioContext, analyser };
}
