import React, { useEffect, useRef, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { SHADOW_BUILD, SHADOW_SEGMENT_MS, SHADOW_DISCARD_COOLDOWN_MS } from './config';
import { ShortNotice } from './RecordingNotice';
import CollectorBoundary from './Boundary';
import { i18n } from '../../../common/i18n';

const fs = require('fs');
const os = require('os');
const path = require('path');
const remote = require('@electron/remote');
const { ipcRenderer } = require('electron');
const bus = require('./bus');
const uploader = require('./uploader');
const hf = require('./hf');
const { HF_TOKEN, VF_FEATURE_VERSION, VF_BUILD_COMMIT, COLLECTOR_VERSION } = require('./config');
const service = require('./service');
const listener = require('./listener');
const pcm = require('./pcm');
const storage = require('./storage');
const presenting = require('./presenting');
const remoteConfig = require('./remote');
const { logDir } = require('../engine/session-log');
const { guard } = require('./diag');

// One folder per app session under <userData>/voice-follow/shadow/<id>/:
//   audio-000.wav ...  - what the microphone heard (16 kHz mono WAV), one per SHADOW_SEGMENT_MS
//   audio-pre.wav      - up to 2 min from before the session started (listener.js)
//   human.jsonl        - what the sevadaar put on screen (the human label)
//   activity.jsonl     - per second: microphone loudness and letters heard
//   system.jsonl       - what Voice-Follow would have shown (shadow mode)
//   events.jsonl       - matches, pauses, audio segment boundaries
//   score.json         - live agreement totals, rewritten every 30 s
//   session.json       - tester, app version, microphone, start time
const shadowRoot = () => path.join(logDir(), 'shadow');

// Diagnostics for machines we cannot see: a startup health line (platform, database,
// model, a real database query) and any renderer error go to errors.log, which uploads
// with the tester's data. This is how "it just shows a spinner" on someone's laptop
// becomes a readable cause.
const diag = (line) => {
  try {
    fs.mkdirSync(shadowRoot(), { recursive: true });
    fs.appendFileSync(
      path.join(shadowRoot(), 'errors.log'),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch (_) {
    /* ignore */
  }
};
if (SHADOW_BUILD && typeof window !== 'undefined' && !window.shadowDiagOn) {
  window.shadowDiagOn = true;
  let count = 0;
  const capped = (line) => {
    count += 1;
    if (count <= 100) diag(line);
  };
  window.addEventListener('error', (e) =>
    capped(`error: ${e.message} @ ${e.filename}:${e.lineno}`),
  );
  window.addEventListener('unhandledrejection', (e) =>
    capped(`unhandled: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`),
  );
  const health = (tag) => {
    try {
      const ud = remote.app.getPath('userData');
      const db = path.join(ud, 'sttmdesktop-evergreen-v2.realm');
      const size = fs.existsSync(db) ? fs.statSync(db).size : 0;
      const model = fs.existsSync(
        path.join(process.resourcesPath || '', 'voice-follow', 'model.int8.onnx'),
      );
      diag(
        `${tag}: ${process.platform} ${os.arch()} app ${remote.app.getVersion()} electron ${process.versions.electron} ` +
          `cpus ${os.cpus().length} (${(os.cpus()[0] || {}).model || '?'} ${(os.cpus()[0] || {}).speed || 0}MHz) ` +
          `mem ${Math.round(os.totalmem() / 1e9)}GB db ${size} bytes ` +
          `isDbDownloaded=${localStorage.getItem('isDbDownloaded')} model=${model}`,
      );
      if (!size) diag(`${tag} db query: skipped, database not downloaded yet`);
      else
        // eslint-disable-next-line global-require
        Promise.resolve(require('../../../banidb').loadShabad(2776))
          .then((v) =>
            diag(`${tag} db query: ok (${v && v.length != null ? v.length : typeof v} lines)`),
          )
          .catch((e) => diag(`${tag} db query: FAILED ${(e && e.message) || e}`));
    } catch (e) {
      diag(`${tag} check failed: ${(e && e.message) || e}`);
    }
  };
  setTimeout(() => health('startup'), 15000);
  setTimeout(() => health('after 3 min'), 180000);
}

// Test hook, never set for testers: launched with VF_TEST_WAV=<audio file>, that file
// replaces the microphone (silently) for both the recorder and hidden Voice-Follow, so an
// end-to-end run can be scripted without playing kirtan aloud. One shared playback, so
// everything hears the same timeline.
if (process.env.VF_TEST_WAV && navigator.mediaDevices) {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let shared = null;
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c || !c.audio) return real(c);
    if (!shared) {
      shared = (async () => {
        const ctx = new AudioContext();
        const raw = fs.readFileSync(process.env.VF_TEST_WAV);
        const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        const src = ctx.createBufferSource();
        src.buffer = await ctx.decodeAudioData(data);
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        // Keep the fake microphone producing (silent) frames after the file ends, as a
        // real microphone would; otherwise the recorder gets nothing to write.
        const silence = ctx.createConstantSource();
        silence.offset.value = 0;
        silence.connect(dest);
        silence.start();
        return dest.stream;
      })();
    }
    // A fresh clone per caller, as a real microphone gives a fresh stream per request:
    // a session stopping its tracks must not silence the next session's.
    return (await shared).clone();
  };
}

// The screen state that names what is being shown.
const labelOf = (nav) => ({
  shabadId: nav.activeShabadId ?? null,
  verseId: nav.activeVerseId ?? null,
  bani: nav.isSundarGutkaBani ? (nav.sundarGutkaBaniId ?? null) : null,
  ceremony: nav.isCeremonyBani ? (nav.ceremonyId ?? null) : null,
  slide: nav.isMiscSlide ? nav.miscSlideText || true : null,
});

// The registration is a user setting, and settings become body class names at startup,
// so it is stored URL-encoded (no spaces). Older installs stored plain JSON.
// What identifies the computer in a session: a random install id (made once, kept in the
// app's settings), the processor, OS, time zone and locale. No computer name, login name or
// internet address (prod collector: identity trimmed).
const newInstallId = () => {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};
const machineFacts = (installId) => ({
  installId: installId || '',
  os: `${process.platform} ${os.release()}`,
  cpus: os.cpus().length,
  cpuModel: (os.cpus()[0] || {}).model || '',
  cpuMhz: (os.cpus()[0] || {}).speed || 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  locale: navigator.language || '',
});

const readTester = (raw) => {
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (_) {
    try {
      return JSON.parse(raw);
    } catch (__) {
      return {};
    }
  }
};
const packTester = (t) => encodeURIComponent(JSON.stringify(t));
// Bump when the first-launch notice changes in substance, so every tester reads it again once.
const NOTICE_VERSION = 2;

const ShadowCollector = () => {
  const nav = useStoreState((state) => state.navigator);
  const {
    shadowRecording,
    shadowTester,
    shadowNotice,
    hfToken,
    collectorLevel,
    installId,
    currentWorkspace,
  } = useStoreState((state) => state.userSettings);
  const { setShadowRecording, setShadowTester, setShadowNotice, setCollectorLevel, setInstallId } =
    useStoreActions((actions) => actions.userSettings);
  // Settings > Other Options > Help improve Voice Autopilot: off | labels | audio.
  const level = collectorLevel === 'labels' || collectorLevel === 'audio' ? collectorLevel : 'off';
  const audioOn = level === 'audio';
  // The older on/off flag (app.js quit-time flush, older code paths) mirrors the level.
  useEffect(() => {
    if (!!shadowRecording !== (level !== 'off')) setShadowRecording(level !== 'off');
  }, [level, shadowRecording, setShadowRecording]);
  useEffect(() => {
    if (!installId) setInstallId(newInstallId());
  }, [installId, setInstallId]);
  useEffect(() => {
    uploader.setAudio(audioOn);
  }, [audioOn]);
  // For the "Recording audio" chip in the workspace bar (RecordingNotice.jsx).
  const { setShadowMicState } = useStoreActions((actions) => actions.app);
  // The Hugging Face write token: baked in at build (VF_HF_TOKEN), or a saved setting.
  const hfTokenRef = useRef('');
  hfTokenRef.current = (hfToken || '').trim() || (HF_TOKEN.startsWith('__') ? '' : HF_TOKEN);
  const tester = readTester(shadowTester);
  const [details, setDetails] = useState(false);
  const [gurdwara, setGurdwara] = useState(tester.gurdwara || '');
  const sessionRef = useRef(null);
  // A session runs only while the sevadaar is working (see service.js).
  const [active, setActive] = useState(false);
  const startReasonRef = useRef('');
  // When the sevadaar last changed what is on screen (null: not since the app opened).
  const lastChangeRef = useRef(null);
  const [restarts, setRestarts] = useState(0);
  const startingRef = useRef(false); // waiting for the microphone (e.g. the permission prompt)
  const preRollRef = useRef(null); // audio from before the session, handed over by the listener
  const discardRef = useRef(false); // the session turned out to be noise: delete, do not upload
  const lastDiscardRef = useRef(0); // when the last noise session was thrown away

  // Remote switch (remote.js): fetched at launch and hourly while sharing is on. Prod build:
  // off until the server turns it on for this install (allow list or percent rollout).
  const [remoteOn, setRemoteOn] = useState(remoteConfig.enabled());
  useEffect(() => {
    if (!SHADOW_BUILD || level === 'off') return undefined;
    remoteConfig.start({ onChange: setRemoteOn, log: diag, installId });
    return () => remoteConfig.stop();
  }, [level, installId]);
  // Sharing is on by default (labels only); nothing runs until the first-launch card has been seen.
  const noticeSeen = Number(shadowNotice) >= NOTICE_VERSION;
  const enabled = SHADOW_BUILD && level !== 'off' && noticeSeen && remoteOn;

  // Presenting-only gate (presenting.js): a display is driven (viewer window open, asked of
  // the main process every 15 s, or single-display mode) AND the screen changed in the last
  // 10 min. Only then may a session (and with it the hidden run) start; the listener is off
  // otherwise. `presentingOn` re-evaluates the listener effect; presentingNow() is the live
  // answer for a start that is about to happen.
  const singleDisplay = currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY');
  const displayRef = useRef({ viewerOpen: false, singleDisplay });
  displayRef.current.singleDisplay = singleDisplay;
  const presentingNow = () =>
    presenting.isPresenting({ ...displayRef.current, lastChangeAt: lastChangeRef.current });
  const [presentingOn, setPresentingOn] = useState(false);
  const presentingOffSinceRef = useRef(null); // when the gate went off during a session
  const idleLogAtRef = useRef(0);
  // A start the gate blocked: one diag line an hour at most.
  const blockedByGate = (what) => {
    if (presentingNow()) return false;
    if (Date.now() - idleLogAtRef.current >= 60 * 60 * 1000) {
      idleLogAtRef.current = Date.now();
      const d = displayRef.current;
      diag(
        `idle: not presenting (${what}; viewer ${d.viewerOpen ? 'open' : 'closed'}, ` +
          `single-display ${d.singleDisplay ? 'on' : 'off'}, last change ` +
          `${lastChangeRef.current ? `${Math.round((Date.now() - lastChangeRef.current) / 60000)} min ago` : 'none'})`,
      );
    }
    return true;
  };
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const poll = async () => {
      try {
        const r = await ipcRenderer.invoke('voice-follow:presenting');
        if (live) displayRef.current.viewerOpen = !!(r && r.viewerOpen);
      } catch (_) {
        /* main process not answering: keep the last answer */
      }
      if (live) setPresentingOn(presentingNow());
    };
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, singleDisplay]);

  // The uploader runs from the moment a registered tester opens the app, so a session left
  // on disk by a crash or a killed app reaches S3 even if the sevadaar never records again.
  useEffect(() => {
    if (enabled) {
      uploader.start(shadowRoot(), tester, { hfOn: () => !!hfTokenRef.current, log: diag });
      hf.start(shadowRoot(), () => hfTokenRef.current, diag);
    }
    // Recording turned off (Settings, the chip or the first-launch card): stop sending now.
    // This cleanup runs before the session's below, so the session that just ended is not
    // queued either; it stays on disk and goes once recording is turned back on.
    return () => {
      uploader.stop();
      hf.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // An older install stored the registration as plain JSON (with spaces): re-save it packed.
  useEffect(() => {
    if (tester.name && shadowTester && /\s/.test(shadowTester)) setShadowTester(packTester(tester));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowTester]);
  const recording = enabled && active;

  // Begin a session now (not from a screen change): the room started sounding, or the
  // sevadaar pressed Start in Voice-Follow. Whatever the listener heard just before comes
  // along as the session's opening audio.
  const beginNow = guard('collector.beginNow', (reason) => {
    if (!enabled || active) return;
    if (blockedByGate(reason)) return;
    if (!storage.canStart(shadowRoot())) {
      diag('storage: disk nearly full, not starting a recording');
      return;
    }
    // Right after a noise session was thrown away, sound alone waits a while.
    if (reason === 'sound' && Date.now() - lastDiscardRef.current < SHADOW_DISCARD_COOLDOWN_MS) {
      return;
    }
    preRollRef.current = listener.takePreRoll();
    startReasonRef.current = reason;
    presentingOffSinceRef.current = null;
    setActive(true);
  });
  const beginNowRef = useRef(beginNow);
  beginNowRef.current = beginNow;

  // With no session running, the listener watches the room so unattended kirtan is collected.
  useEffect(() => {
    if (!enabled || active || !presentingOn) {
      listener.stop();
      if (!active) setShadowMicState('off');
      return undefined;
    }
    let live = true;
    listener
      .start(() => beginNowRef.current('sound'))
      .then(() => {
        if (live && listener.running()) setShadowMicState('listening');
      })
      .catch((e) => {
        diag(`listener: ${e.message}`);
        if (live) setShadowMicState('off');
      });
    return () => {
      live = false;
      listener.stop();
    };
  }, [enabled, active, presentingOn, setShadowMicState]);

  // Pressing Start in Voice-Follow begins a session at once, so its search is recorded too.
  useEffect(() => {
    const onStart = guard('collector.onStart', () => beginNowRef.current('voice-follow start'));
    window.addEventListener('vf-shadow-start', onStart);
    return () => window.removeEventListener('vf-shadow-start', onStart);
  }, []);

  useEffect(() => {
    if (!recording) return undefined;
    let stopped = false;
    let segTimer = null;
    let meterTimer = null;
    let meterCtx = null;
    const start = guard('collector.start', async () => {
      startingRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // The audio from just before (the listener's pre-roll) opens the session, so the
        // session clock starts that much earlier and every timeline lines up with it.
        const pre = preRollRef.current;
        preRollRef.current = null;
        const startedAt = Date.now();
        const t0 = startedAt - (pre ? Math.round(pre.seconds * 1000) : 0);
        const id = new Date(t0).toISOString().replace(/[:.]/g, '-');
        const dir = path.join(shadowRoot(), id);
        fs.mkdirSync(dir, { recursive: true });
        if (pre && audioOn) {
          try {
            fs.writeFileSync(path.join(dir, 'audio-pre.wav'), listener.wavBytes(pre));
          } catch (_) {
            /* never disturb the sevadaar */
          }
        }
        discardRef.current = false;
        const s = { dir, t0, startedAt, stream, recorder: null, seg: 0 };
        sessionRef.current = s;
        startingRef.current = false;
        setShadowMicState('recording');
        fs.writeFileSync(
          path.join(dir, 'session.json'),
          JSON.stringify(
            {
              id,
              tester: readTester(shadowTester),
              machine: machineFacts(installId),
              installId: installId || '',
              collector: COLLECTOR_VERSION,
              sharing: level,
              startedAt: new Date(t0).toISOString(),
              app: remote.app.getVersion(),
              build: `vf-${VF_FEATURE_VERSION}`,
              feature: {
                version: VF_FEATURE_VERSION,
                commit: VF_BUILD_COMMIT.startsWith('__') ? 'dev' : VF_BUILD_COMMIT,
              },
              platform: process.platform,
              microphone: stream.getAudioTracks()[0]?.label || '',
              startedBy: startReasonRef.current,
              presenting: { ...displayRef.current },
              preRollSeconds: pre ? Math.round(pre.seconds * 10) / 10 : 0,
            },
            null,
            1,
          ),
        );
        bus.begin(dir, t0);
        bus.note({ type: 'session_start', reason: startReasonRef.current });
        if (pre && audioOn)
          bus.note({ type: 'pre_roll', file: 'audio-pre.wav', seconds: pre.seconds });
        bus.human(labelOf(nav));
        const event = (obj) => {
          try {
            fs.appendFileSync(
              path.join(dir, 'events.jsonl'),
              `${JSON.stringify({ t: (Date.now() - t0) / 1000, ...obj })}\n`,
            );
          } catch (_) {
            /* never disturb the sevadaar */
          }
        };
        // The microphone stream ends when the computer sleeps, the input device changes or
        // the mic is taken away; get a fresh one whenever that happens.
        const live = () => s.stream.getAudioTracks().some((t) => t.readyState === 'live');
        const reacquire = async () => {
          try {
            s.stream.getTracks().forEach((t) => t.stop());
          } catch (_) {
            /* already gone */
          }
          s.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
          });
          event({ type: 'mic_restarted', microphone: s.stream.getAudioTracks()[0]?.label || '' });
        };
        // Audio in self-contained segments so finished ones can upload during the service.
        // eslint-disable-next-line no-use-before-define
        const onEnded = () => rotate();
        const startSegment = () => {
          // Labels only: the microphone stays open for the loudness meter and the hidden
          // run, but nothing is written to disk.
          if (!audioOn) {
            s.stream.getAudioTracks().forEach((t) => t.addEventListener('ended', onEnded));
            return;
          }
          const n = s.seg;
          s.seg += 1; // a failed start never reuses a file name
          const file = path.join(dir, `audio-${String(n).padStart(3, '0')}.wav`);
          // Uncompressed 16 kHz mono WAV, as the team's recorder captures training audio.
          const rec = pcm.record(s.stream, file);
          s.recorder = rec;
          s.recFile = file;
          event({ type: 'audio_segment', file: path.basename(file), rate: rec.rate });
          s.stream.getAudioTracks().forEach((t) => t.addEventListener('ended', onEnded));
        };
        const endSegment = () => {
          if (!s.recorder) return;
          s.recorder.stop();
          s.recorder = null;
          if (s.recFile) uploader.enqueue(dir, path.basename(s.recFile));
        };
        let rotating = false;
        const rotate = async () => {
          if (rotating || stopped) return;
          rotating = true;
          try {
            endSegment();
          } catch (_) {
            /* already stopped */
          }
          try {
            if (!live()) await reacquire();
            if (!stopped) startSegment();
          } catch (e) {
            event({ type: 'mic_error', error: e?.message || String(e) });
          } finally {
            rotating = false;
          }
        };
        // Loudness meter for the activity log (reattached whenever the mic is replaced).
        let analyser = null;
        let meterStream = null;
        const buf = new Float32Array(2048);
        meterCtx = new (window.AudioContext || window.webkitAudioContext)();
        meterTimer = setInterval(() => {
          try {
            if (meterStream !== s.stream) {
              meterStream = s.stream;
              analyser = meterCtx.createAnalyser();
              analyser.fftSize = 2048;
              meterCtx.createMediaStreamSource(s.stream).connect(analyser);
            }
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let k = 0; k < buf.length; k += 1) sum += buf[k] * buf[k];
            bus.level(Math.sqrt(sum / buf.length));
          } catch (_) {
            /* meter only; recording carries on */
          }
        }, 250);
        startSegment();
        // A new file every SHADOW_SEGMENT_MS; also check every 20 s that the mic is alive.
        let lastRotate = Date.now();
        segTimer = setInterval(
          guard('collector.segment', () => {
            if (Date.now() - lastRotate >= SHADOW_SEGMENT_MS || !live()) {
              lastRotate = Date.now();
              rotate();
            }
          }),
          20000,
        );
      } catch (e) {
        startingRef.current = false;
        setShadowMicState('off');
        try {
          fs.mkdirSync(shadowRoot(), { recursive: true });
          fs.appendFileSync(
            path.join(shadowRoot(), 'errors.log'),
            `${new Date().toISOString()} ${e?.message || e}\n`,
          );
        } catch (_) {
          /* ignore */
        }
      }
    });
    start();
    // quitting: the main process uploads what is left (app.js will-quit), so the dying
    // page must not race it over uploaded.json.
    const stop = guard('collector.stop', (quitting) => {
      stopped = true;
      clearInterval(segTimer);
      clearInterval(meterTimer);
      try {
        if (meterCtx) meterCtx.close();
      } catch (_) {
        /* already closed */
      }
      const s = sessionRef.current;
      sessionRef.current = null;
      if (!s) return;
      setShadowMicState('off');
      try {
        if (s.recorder) s.recorder.stop();
        s.recorder = null;
      } catch (_) {
        /* already stopped */
      }
      try {
        s.stream.getTracks().forEach((t) => t.stop());
      } catch (_) {
        /* already gone */
      }
      bus.end();
      if (discardRef.current) {
        discardRef.current = false;
        try {
          fs.rmSync(s.dir, { recursive: true, force: true });
          diag(`discarded ${path.basename(s.dir)}: the room started it and no words were heard`);
        } catch (_) {
          /* ignore */
        }
        return;
      }
      if (quitting !== true) uploader.enqueueSession(s.dir);
    });
    const onUnload = () => stop(true);
    window.addEventListener('beforeunload', onUnload);
    uploader.start(shadowRoot(), readTester(shadowTester));
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      stop(false);
    };
    // Once per active service (or watchdog restart); the label effect records every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, restarts]);

  // Stop when the sevadaar has been idle long enough (service.js decides).
  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(
      guard('collector.stopCheck', () => {
        const s = sessionRef.current;
        if (storage.mustStop(shadowRoot())) {
          bus.note({ type: 'session_stop', reason: 'disk_low' });
          setActive(false);
          return;
        }
        // The display went away (viewer closed / single display off) for 10 min straight:
        // end the session the same way as the quiet stop, so it uploads as usual. A long
        // Shabad on one pangti never ends it: change recency only gates starting.
        presentingOffSinceRef.current = presenting.trackOff(
          presenting.displayOn(displayRef.current),
          presentingOffSinceRef.current,
        );
        const gateReason = presenting.stopReason(presentingOffSinceRef.current);
        if (gateReason) {
          bus.note({ type: 'session_stop', reason: gateReason });
          setActive(false);
          return;
        }
        const reason = service.stopReason({
          now: Date.now(),
          startedAt: s ? s.startedAt : Date.now(),
          startedBy: startReasonRef.current,
          lastChangeAt: lastChangeRef.current,
          lastHeardAt: bus.lastHeardAt(),
          lastSoundAt: bus.lastSoundAt(),
          vfUpAt: bus.vfUpAt(),
        });
        if (!reason) return;
        bus.note({ type: 'session_stop', reason });
        if (
          reason === 'no_words' ||
          service.discardOnStop({
            now: Date.now(),
            startedAt: s ? s.startedAt : Date.now(),
            startedBy: startReasonRef.current,
            lastHeardAt: bus.lastHeardAt(),
            vfUpAt: bus.vfUpAt(),
          })
        ) {
          discardRef.current = true;
          lastDiscardRef.current = Date.now();
        }
        setActive(false);
      }),
      20000,
    );
    return () => clearInterval(timer);
  }, [recording]);

  // Watchdog: while a service is active, recording must be on. If it ever stopped, note
  // it and start again.
  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(
      guard('collector.watchdog', () => {
        if (sessionRef.current || startingRef.current) return;
        try {
          fs.mkdirSync(shadowRoot(), { recursive: true });
          fs.appendFileSync(
            path.join(shadowRoot(), 'errors.log'),
            `${new Date().toISOString()} recording was not running; restarted\n`,
          );
        } catch (_) {
          /* ignore */
        }
        setRestarts((n) => n + 1);
      }),
      60000,
    );
    return () => clearInterval(timer);
  }, [recording]);

  // Every change of what is on screen, timestamped against the audio; the first change
  // after the app opens starts a session.
  const label = labelOf(nav);
  const key = JSON.stringify(label);
  const prevKeyRef = useRef(null);
  useEffect(
    guard('collector.screenChange', () => {
      const prev = prevKeyRef.current;
      prevKeyRef.current = key;
      if (sessionRef.current) bus.human(label);
      const changed = prev != null && key !== prev;
      if (changed) lastChangeRef.current = Date.now();
      if (enabled && !active && changed) setPresentingOn(presentingNow());
      if (
        enabled &&
        !active &&
        service.shouldStart(prev, key) &&
        !blockedByGate('screen change') &&
        storage.canStart(shadowRoot())
      ) {
        let what = 'cleared';
        if (bus.contentKey(label)) what = bus.contentKey(label);
        else if (label.slide) what = 'slide';
        startReasonRef.current = `screen: ${what}`;
        presentingOffSinceRef.current = null;
        setActive(true);
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  // First launch (and once more whenever NOTICE_VERSION is bumped): a slim, non-blocking bar at
  // the top asks once. Nothing is collected until "Allow"; Allow = labels + audio (the setting's
  // default), "No thanks" = off. STTM stays fully usable while the bar is showing.
  const registered = !!tester.id;
  if (!SHADOW_BUILD || level === 'off' || (registered && noticeSeen)) return null;

  const allow = () => {
    if (!registered) {
      setShadowTester(
        packTester({
          name: '',
          gurdwara: gurdwara.trim(),
          id: tester.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        }),
      );
    }
    setShadowNotice(NOTICE_VERSION);
  };
  const deny = () => {
    setShadowNotice(NOTICE_VERSION);
    setCollectorLevel('off');
  };

  return (
    <div className="shadow-ask" role="region" aria-label="Help improve Shabad search">
      <div className="shadow-ask-row">
        <i className="fa fa-microphone shadow-ask-icon" aria-hidden="true" />
        <span className="shadow-ask-text">
          Help improve Shabad search? Share diwan audio and the pangtis on screen with Khalis
          Foundation.
        </span>
        <button
          type="button"
          className="shadow-ask-link"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          {details ? 'Less' : 'Details'}
        </button>
        <button type="button" className="shadow-ask-no" onClick={deny}>
          No thanks
        </button>
        <button type="button" className="shadow-ask-yes" onClick={allow}>
          Allow
        </button>
      </div>
      {details && (
        <div className="shadow-ask-details">
          <ShortNotice audio />
          {!registered && (
            <label htmlFor="shadow-gurdwara">
              Gurdwara Sahib (optional)
              <input
                id="shadow-gurdwara"
                className="disable-kb-shortcuts"
                value={gurdwara}
                onChange={(e) => setGurdwara(e.target.value)}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
};

// Fault wrapping: a render error in the collector unmounts it (logged), never STTM.
const GuardedShadowCollector = () => (
  <CollectorBoundary name="ShadowCollector">
    <ShadowCollector />
  </CollectorBoundary>
);

export default GuardedShadowCollector;
