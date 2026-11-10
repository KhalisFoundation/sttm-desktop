import { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';

const fs = require('fs');
const path = require('path');
const azure = require('../../data-recording/azure-upload');
// The Shadower's Azure container and its append-only key, injected at build (VF_UPLOAD_SAS).
const { UPLOAD_URL, UPLOAD_SAS } = require('../../addons/voice-follow/shadow/config');
const pcm = require('../../data-recording/pcm');

const uploadsOn = () => azure.configured(UPLOAD_URL, UPLOAD_SAS);

const readSession = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8'));
  } catch (_) {
    return null;
  }
};

// Upload one finished recording; on success the local copy is removed (it is in Azure).
// On failure (offline) it stays and is retried at the next launch.
const pushRecording = async (dir) => {
  const session = readSession(dir);
  if (!session || !uploadsOn()) return false;
  const started = Date.now();
  try {
    const repo = await azure.pushRecording(dir, { url: UPLOAD_URL, sas: UPLOAD_SAS });
    // eslint-disable-next-line no-console
    console.log(`recording: pushed ${path.basename(dir)} -> ${repo}`);
    fs.rmSync(dir, { recursive: true, force: true });
    ipcRenderer.send('recording-upload-result', {
      ok: true,
      seconds: (Date.now() - started) / 1000,
    });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`recording: upload of ${path.basename(dir)} failed: ${e.message}`);
    ipcRenderer.send('recording-upload-result', {
      ok: false,
      seconds: (Date.now() - started) / 1000,
    });
    return false;
  }
};

// Recordings left from an earlier run (closed or offline before the upload finished).
const pushPending = async () => {
  const prefs = await ipcRenderer.invoke('get-recording-settings');
  const root = prefs && prefs.recordingsDir;
  if (!root || !uploadsOn() || !fs.existsSync(root)) return;
  const dirs = fs
    .readdirSync(root)
    .map((id) => path.join(root, id))
    .filter((d) => {
      const id = path.basename(d);
      return (
        fs.existsSync(path.join(d, 'session.json')) &&
        fs.existsSync(path.join(d, 'audio', `${id}.wav`))
      );
    })
    .sort();
  // eslint-disable-next-line no-restricted-syntax
  for (const dir of dirs) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await pushRecording(dir))) break; // offline: try again next launch
  }
};

// Records straight to disk: 16 kHz mono 16-bit WAV written as it goes, samples taken on the audio
// thread (no dropouts when the page is busy), the browser's own resampler (no aliasing), raw
// microphone (no echo cancellation, noise suppression or auto gain). Memory stays flat for long
// recordings, and a crash leaves a valid file missing only the last few seconds.
export const useAudioRecorder = () => {
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const pendingRef = useRef(null); // a start that is still opening the microphone

  useEffect(() => {
    pushPending();

    const startCapture = async (sessionId, folderPath) => {
      let deviceId = 'default';
      try {
        deviceId = window.localStorage.getItem('sttm-data-mic-device') || 'default';
      } catch (_) {
        /* the system default */
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const rec = await pcm.open(stream, { holdSeconds: 0 });
      recRef.current = rec;
      const audioDir = path.join(folderPath, 'audio');
      fs.mkdirSync(audioDir, { recursive: true });
      rec.begin(path.join(audioDir, `${sessionId}.wav`));
      ipcRenderer.send('recording-audio-started', { at: Date.now() });
    };

    const stopCapture = async (folderPath) => {
      if (pendingRef.current) await pendingRef.current.catch(() => {});
      const rec = recRef.current;
      recRef.current = null;
      let health = null;
      if (rec) {
        health = rec.health();
        await rec.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // How complete the audio is (1.0 = nothing missing), kept with the recording.
      try {
        const f = path.join(folderPath, 'session.json');
        const session = JSON.parse(fs.readFileSync(f, 'utf8'));
        fs.writeFileSync(f, JSON.stringify({ ...session, audio: health }, null, 1));
      } catch (_) {
        /* session.json missing: upload still works from the WAV */
      }
      pushRecording(folderPath);
    };

    const handleToggle = (_event, { isRecording, sessionId, folderPath }) => {
      if (isRecording) {
        pendingRef.current = startCapture(sessionId, folderPath).catch((e) => {
          // eslint-disable-next-line no-console
          console.warn(`recording: microphone did not start: ${e.message}`);
        });
      } else {
        stopCapture(folderPath);
      }
    };

    ipcRenderer.on('recording-toggle', handleToggle);
    return () => ipcRenderer.removeListener('recording-toggle', handleToggle);
  }, []);
};
