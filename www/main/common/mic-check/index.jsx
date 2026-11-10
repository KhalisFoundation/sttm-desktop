// Microphone check shared by STTM Data recording (RecordingControls) and Voice Autopilot:
// what kind of input a device is (from its name), and a live level bar that says whether we
// can hear it. Styles: www/src/scss/_mic-check.scss (.mic-level, .mic-tip).
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

// What kind of input this is, from its name. Only the mixer (best) or the computer's own mic is
// what we want; webcams, phones, Bluetooth headsets and virtual/streaming inputs are usually
// picked by accident, so the card warns about them.
export const MIC_PATTERNS = [
  // Phone-as-webcam apps (DroidCam, EpocCam) first, so they read as a phone, not a webcam.
  [
    'phone',
    /iphone|ipad|android|galaxy|pixel|\bphone\b|smartphone|\bmobile\b|droid ?cam|epoc ?cam|wo ?mic|ivcam/i,
  ],
  ['webcam', /webcam|camera|cam\b|c9[0-9]{2}|brio|facetime|kiyo|elgato facecam/i],
  [
    'bluetooth',
    /airpods|bluetooth|hands-?free|buds|headset|headphone|earphone|bose|beats|jabra|soundcore|wh-?1000|\bhfp\b/i,
  ],
  [
    'virtual',
    /virtual|iriun|\bndi\b|zoom ?audio|\bteams\b|blackhole|loopback|soundflower|vb-?audio|voicemeeter|splashtop|\bobs\b|stereo mix|cable output|discord|\bcamo\b|nvidia broadcast|rtx voice|webex|krisp|xsplit|streamlabs|steam streaming|sonar|nahimic|what ?u ?hear|wave ?out/i,
  ],
  ['mixer', /line ?in/i], // a cable into the PC's line-in jack
  ['laptop', /built-?in|internal|macbook|microphone array|realtek/i],
  [
    'mixer',
    /mixer|usb audio|codec|interface|line ?in|focusrite|scarlett|behringer|yamaha|zoom h|tascam|presonus|mackie|rode|xlr|soundcraft|allen|m-?audio|motu|steinberg|audient|umc|xenyx/i,
  ],
];
export const micKind = (label) => {
  const hit = MIC_PATTERNS.find(([, re]) => re.test(label || ''));
  return hit ? hit[0] : 'other';
};
export const MIC_WARN = {
  webcam: 'This looks like a webcam mic.',
  phone: 'This looks like a phone mic.',
  bluetooth: 'This looks like Bluetooth earphones or a headset.',
  virtual: 'This looks like a virtual or streaming input, not a microphone.',
};

// Live loudness of one input (0..1), and whether we have heard anything in the last few seconds.
export const useInputLevel = (deviceId, active) => {
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(null); // null: still listening, true/false after ~2 s
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let stream = null;
    let ctx = null;
    let timer = null;
    setLevel(0);
    setHeard(null);
    const opened = Date.now();
    let lastSound = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: !deviceId || deviceId === 'default' ? undefined : { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (stopped) return;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i]));
          const db = 20 * Math.log10(peak || 1e-6); // -120 (silence) .. 0 (full scale)
          setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
          const now = Date.now();
          if (db > -50) lastSound = now;
          if (now - opened > 2000) setHeard(now - lastSound < 3000);
        }, 100);
      } catch (_) {
        if (!stopped) setHeard(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
    };
  }, [deviceId, active]);
  return { level, heard };
};

export const LevelMeter = ({ level, heard, compact }) => (
  <span className={`mic-level${compact ? ' compact' : ''}`}>
    <span className="mic-level-bar">
      <span
        className={`mic-level-fill${heard === false ? ' silent' : ''}`}
        style={{ width: `${Math.round(level * 100)}%` }}
      />
    </span>
    {!compact && (
      <span className={`mic-level-text${heard === false ? ' silent' : ''}`}>
        {heard === null && 'Listening...'}
        {heard === true && (
          <>
            <i className="fa fa-check" /> We can hear it
          </>
        )}
        {heard === false && (
          <>
            <i className="fa fa-exclamation-triangle" /> Silent: no sound from this input
          </>
        )}
      </span>
    )}
  </span>
);

LevelMeter.propTypes = {
  level: PropTypes.number,
  heard: PropTypes.bool,
  compact: PropTypes.bool,
};
