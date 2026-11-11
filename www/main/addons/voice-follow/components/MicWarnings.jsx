import React, { useEffect, useRef, useState } from 'react';
import { i18n } from '../../../common/i18n';
import { micKind, MIC_WARN } from '../../../common/mic-check';

const sessionLog = require('../engine/session-log');
const { SHADOW_BUILD } = require('../shadow/config');
const mw = require('./micWarning');

// Wrong-microphone warnings for the sevadaar's Autopilot panel (never a sangat screen), in the
// "Check this computer" status-line style (.vf-hw). Field logs: Gurdwara Sahibs listened through
// a phone-camera default ("Iriun Webcam #4") or a silent input, and one Mac listened to an empty
// hall for 57 h. Logic lives in micWarning.js (unit-tested); this hook wires it to the panel.
const wrongKind = (label) => (MIC_WARN[micKind(label)] ? micKind(label) : null);
const KINDS = { kindOf: micKind, isWrong: wrongKind };
const NO_ESCAPE = { interpolation: { escapeValue: false } }; // React escapes device names
const T = (key, vars) => i18n.t(`VOICE_FOLLOW.${key}`, vars && { ...vars, ...NO_ESCAPE });
const AUTOPAUSE_MIN = mw.autoPauseMinutes(typeof process !== 'undefined' ? process.env : {});

// How loud another input is right now: open it for 1.5 s, read its level, close it. Nothing is
// recorded, kept or sent.
const probeLevel = async (ctx, deviceId) => {
  let stream = null;
  let src = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false },
    });
    const an = ctx.createAnalyser();
    src = ctx.createMediaStreamSource(stream);
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const reads = [];
    for (let i = 0; i < 15; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => {
        setTimeout(r, 100);
      });
      an.getFloatTimeDomainData(buf);
      reads.push(Math.sqrt(buf.reduce((e, v) => e + v * v, 0) / buf.length));
    }
    return reads.sort((a, b) => a - b)[11];
  } catch (_) {
    return null; // busy, gone or blocked: not offered
  } finally {
    src?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
  }
};

// The status line: a coloured icon and verdict, then a muted line of links that say what they do
// ([label, onClick, tooltip]).
const line = (tone, icon, verdict, title, links) => (
  <div className={`vf-hw vf-mic-status is-${tone}`} role="status">
    <div className="vf-hw-verdict" title={title}>
      <i className={`fa ${icon}`} aria-hidden="true" /> {verdict}
    </div>
    <div className="vf-hw-detail">
      {links.map(([label, onClick, tip], i) => (
        <React.Fragment key={label}>
          {i > 0 && ' · '}
          <button type="button" className="vf-hw-link" title={tip} onClick={onClick}>
            {label}
          </button>
        </React.Fragment>
      ))}
    </div>
  </div>
);

// p: { mics, micId, setMicId, saveMicPref, active, running, micDenied, visibleRef, sessionIdRef,
//      audio: { ctxRef, nodeRef, srcRef, streamRef, setMicStream, volumeRef } }
const useMicWarnings = (p) => {
  const { mics, micId, active, audio } = p;
  const watch = useRef(mw.createMicWatch({ pauseMs: AUTOPAUSE_MIN * 60000 })).current;
  const live = useRef({ deviceId: '', label: '' });
  const heardAt = useRef(0);
  const pick = useRef(micId);
  const shown = useRef(new Set());
  const dismissed = useRef(new Set());
  const avoidedLogged = useRef('');
  const [hint, setHint] = useState(null); // 'silent' | 'quiet' | null
  const [probe, setProbe] = useState(null); // an input the probe heard sound on
  const [paused, setPaused] = useState(false);
  const [confirmFor, setConfirmFor] = useState(null); // Start pressed on this flagged input
  const [, setTick] = useState(0);
  const log = (type, fields) =>
    sessionLog.logEvent(type, { session: p.sessionIdRef.current, ...fields });
  const reset = () => {
    watch.reset();
    audio.volumeRef.current = { hist: [], state: 'good' };
    setHint(null);
    setProbe(null);
    setPaused(false);
  };

  // The input to use: the saved one; without it, the system default unless its name looks wrong
  // and another input exists (then the best other: mixer, built-in, any).
  const saved = mics.list.find((d) => d.deviceId === micId) || null;
  const system =
    mics.list.find((d) => mics.defaultGroup && d.groupId === mics.defaultGroup) ||
    mics.list[0] ||
    null;
  const auto = saved ? null : mw.pickDefaultMic(mics.list, system, KINDS);
  const shownMic = saved || (auto && auto.device) || null;
  if (saved) pick.current = micId;
  else if (auto && auto.avoided) pick.current = auto.device.deviceId;
  else pick.current = mics.list.length ? '' : micId;
  if (auto && auto.avoided && avoidedLogged.current !== auto.avoided.deviceId) {
    avoidedLogged.current = auto.avoided.deviceId;
    log('mic_default_avoided', { picked: auto.device.label, avoided: auto.avoided.label });
  }
  const choose = (deviceId) => {
    p.setMicId(deviceId);
    p.saveMicPref(deviceId);
    pick.current = deviceId;
  };

  const names = mw.friendlyMicNames(mics.list);
  const name = (d) =>
    (d && (names.get(d.deviceId) || mw.friendlyMicName(d.label))) || T('DEFAULT_MIC');
  // A hint shows unless dismissed for that device; it is logged once when first shown.
  const keyOf = (kind, d) => `${kind}:${d.deviceId || d.label}`;
  const showing = (kind, d) => {
    const key = keyOf(kind, d);
    if (dismissed.current.has(key)) return false;
    if (!shown.current.has(key)) {
      shown.current.add(key);
      log('mic_warning', { kind, device: d.label || '' });
    }
    return true;
  };
  const dismiss = (kind, d) => [
    T('MIC_DISMISS'),
    () => {
      dismissed.current.add(keyOf(kind, d));
      log('mic_warning_dismiss', { kind, device: d.label || '' });
      setTick((n) => n + 1);
    },
    T('MIC_HINT_DISMISS'),
  ];
  const use = (d, onPick) => [T('MIC_USE', { mic: name(d) }), () => onPick(d.deviceId), d.label];

  // Switch the running session to another input in place (the same pipeline, so what Autopilot
  // found so far is kept). Only ever on the sevadaar's click.
  const switchMic = async (deviceId) => {
    const from = live.current.label;
    choose(deviceId);
    const ctx = audio.ctxRef.current;
    const node = audio.nodeRef.current;
    if (!p.running || !ctx || !node) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false },
      });
    } catch (e) {
      log('mic_switch', { from, to: '', error: (e && e.name) || 'error' });
      return;
    }
    if (audio.ctxRef.current !== ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    src.connect(node);
    audio.srcRef.current?.disconnect();
    audio.streamRef.current?.getTracks().forEach((t) => t.stop());
    audio.srcRef.current = src;
    audio.streamRef.current = stream;
    audio.setMicStream(stream);
    live.current = { deviceId, label: stream.getAudioTracks()[0]?.label };
    reset();
    log('mic_switch', { from, to: live.current.label });
  };
  // Auto-pause: stop listening, the screen stays exactly as it is; Resume continues the session.
  const setListening = (on) => {
    audio.streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = on; // eslint-disable-line no-param-reassign
    });
    audio.ctxRef.current?.[on ? 'resume' : 'suspend']?.()?.catch?.(() => {});
  };
  const resume = () => {
    setListening(true);
    reset();
    log('autopilot_resume', {});
  };

  // No sound: listen for a moment to each other real input and offer the one with sound.
  const silentShown =
    active && hint === 'silent' && !dismissed.current.has(keyOf('silent', live.current));
  useEffect(() => {
    const ctx = audio.ctxRef.current;
    if (!silentShown || !ctx) return undefined;
    let on = true;
    let rounds = 0;
    const round = async () => {
      rounds += 1;
      const found = [];
      // eslint-disable-next-line no-restricted-syntax
      for (const d of mics.list
        .filter((x) => x.deviceId !== live.current.deviceId && !wrongKind(x.label))
        .slice(0, 6)) {
        // eslint-disable-next-line no-await-in-loop
        const rms = on ? await probeLevel(ctx, d.deviceId) : null;
        if (rms != null) found.push({ ...d, rms });
      }
      const best = mw.pickProbedMic(found);
      if (on && best) {
        setProbe(best);
        log('mic_probe', { found: best.label, rms: Math.round(best.rms * 1e4) / 1e4 });
      }
    };
    round();
    const timer = setInterval(() => rounds < 4 && round(), 30000);
    return () => {
      on = false;
      clearInterval(timer);
    };
  }, [silentShown, mics.list]);

  // Running: the line above the cards (auto-paused, no sound, or hears very little).
  const liveMic = live.current;
  const warn = 'fa-exclamation-triangle';
  let runLine = null;
  if (active && paused) {
    const verdict = T('AUTOPAUSED', { min: AUTOPAUSE_MIN });
    runLine = line('below', 'fa-pause-circle', verdict, liveMic.label, [
      [T('AUTOPAUSE_RESUME'), resume],
    ]);
  } else if (silentShown && showing('silent', liveMic)) {
    const links = [...(probe ? [use(probe, switchMic)] : []), dismiss('silent', liveMic)];
    const verdict = T('MIC_SILENT_TITLE', { mic: name(liveMic) });
    runLine = line('wrong', warn, verdict, liveMic.label, links);
  } else if (active && hint === 'quiet' && showing('quiet', liveMic)) {
    const links = [dismiss('quiet', liveMic)];
    runLine = line('below', warn, T('MIC_QUIET_TITLE'), T('MIC_QUIET'), links);
  }

  // Start screen: a name that looks wrong gets a red line with "Use <best other>"; Start on it
  // asks first ("Use <best other> · Start anyway").
  const wrong = !active && !p.micDenied && shownMic ? wrongKind(shownMic.label) : null;
  const best = wrong ? mw.bestOtherMic(mics.list, shownMic.deviceId, KINDS) : null;
  const confirming = wrong && confirmFor === shownMic.deviceId;
  const start = (onMainClick) => {
    if (wrong && !confirming) {
      setConfirmFor(shownMic.deviceId);
      return;
    }
    setConfirmFor(null);
    onMainClick();
  };
  let startLine = null;
  if (confirming || (wrong && showing(wrong, shownMic))) {
    const verdict = T(confirming ? 'MIC_START_CONFIRM' : 'MIC_WRONG', {
      mic: name(shownMic),
      kind: T(`MIC_KIND_${wrong.toUpperCase()}`),
    });
    const startWith = (choice, id) => (onMainClick) => {
      log('mic_start_confirm', { choice, device: shownMic.label });
      if (id) choose(id);
      setConfirmFor(null);
      onMainClick();
    };
    const title = `${T('MIC_CANT_HEAR')} (${shownMic.label})`;
    startLine = (onMainClick) =>
      line(
        'wrong',
        warn,
        verdict,
        title,
        confirming
          ? [
              ...(best ? [use(best, (id) => startWith('use', id)(onMainClick))] : []),
              [T('MIC_START_ANYWAY'), () => startWith('anyway')(onMainClick), shownMic.label],
            ]
          : [...(best ? [use(best, choose)] : []), dismiss(wrong, shownMic)],
      );
  }

  // Running, in the bottom bar: "Hearing" (green), "No sound" (red) or "Checking" (grey).
  const hearState = { true: 'on', false: 'off', null: 'wait' }[watch.hearing()];
  const liveDot = (
    <span
      className={`vf-ap-vol vf-mic-live${{ on: ' is-good', off: ' is-none', wait: '' }[hearState]}`}
      role="status"
      title={liveMic.label}
    >
      <i className="fa fa-circle" aria-hidden="true" />
      {T({ wait: 'MIC_CHECKING', on: 'MIC_HEARING', off: 'MIC_NO_SOUND' }[hearState])}
    </span>
  );

  return {
    shownMic,
    pick: () => pick.current,
    // A session's microphone has opened.
    onStream(stream) {
      const track = stream.getAudioTracks?.()[0];
      live.current = { deviceId: track?.getSettings?.()?.deviceId || '', label: track?.label };
      heardAt.current = Date.now();
      reset();
    },
    // One 250 ms level window; lastHeard: when confident words were last heard.
    onWindow(rms, lastHeard, now) {
      const r = watch.push({ rms, heard: lastHeard > heardAt.current, now });
      heardAt.current = now;
      setHint((h) => (h === r.hint ? h : r.hint));
      if (r.pause && (!SHADOW_BUILD || p.visibleRef.current)) {
        setListening(false);
        setPaused(true);
        log('autopilot_auto_pause', { silentMin: Math.round(watch.silentMs(now) / 6000) / 10 });
      }
    },
    start,
    startLine,
    runLine,
    liveDot,
    hearing: hearState === 'on',
  };
};

export default useMicWarnings;
