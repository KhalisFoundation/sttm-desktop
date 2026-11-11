import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ipcRenderer } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { useKeys, useRecordingState } from '../common/hooks';
import { micKind, useInputLevel, LevelMeter } from '../common/mic-check';

const HEARD_TEXT = { true: 'Hearing it', null: 'Listening', false: 'Quiet' };

// One-line notes for inputs that are probably the wrong one (kinds from common/mic-check).
const SHORT_WARN = {
  webcam: 'Webcam mic?',
  phone: 'Phone mic?',
  bluetooth: 'Bluetooth earphones?',
  virtual: 'Virtual input, not a mic?',
};

// What is being recorded (the folder under sttm-data/<private|public>/ in Azure).
const KINDS = [
  ['kirtan', 'Kirtan', 'fa-music', 'Shabad Kirtan by Ragi Singhs'],
  ['paath', 'Paath', 'fa-book', 'Japji Sahib Ji, Rehras Sahib Ji'],
  ['akhand_kirtan', 'Sangat Roopi Kirtan', 'fa-refresh', 'Akhand Kirtan, AKJ Smagams'],
];
const DEVICE_KEY = 'sttm-data-mic-device'; // the input chosen on this PC (useAudioRecorder reads it)

const savedDevice = () => {
  try {
    return window.localStorage.getItem(DEVICE_KEY) || 'default';
  } catch (_) {
    return 'default';
  }
};

// The computer's audio inputs, e.g. 'MacBook Pro Microphone', 'USB Audio CODEC'.
const listInputs = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
      .map((d) => ({
        id: d.deviceId,
        label: (d.label || 'Microphone').replace(/^Default - (.*)$/, 'System default ($1)'),
      }));
  } catch (_) {
    return [];
  }
};

const VIS = [
  [
    'private',
    'fa-lock',
    'Private',
    'Not livestreamed or posted anywhere. The most valuable; never trained on.',
  ],
  ['public', 'fa-globe', 'Public', 'Livestreamed or posted (YouTube, Instagram, Facebook...).'],
];

const AUTOPILOT_KEY = 'sttm-data-autopilot-before'; // Autopilot settings to restore when switched off

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// STTM Data recording bar (top right of the workspace; shown when the Settings switch is on): pick what is being recorded,
// Private (not online anywhere: the most valuable, kept for fair testing, never trained on) or
// Public (livestreamed or shared: used for training), then Record / Stop. A short welcome card
// with the consent (and an optional Gurdwara Sahib name) shows once, when the app opens.
const RecordingControls = ({ refreshKey, searchRef }) => {
  // Off unless Settings > Other Options > STTM Data recording is on (testers).
  const { dataRecording, voiceFollowEnabled, shadowRecording } = useStoreState(
    (state) => state.userSettings,
  );
  const { setDataRecording, setVoiceFollowEnabled, setShadowRecording } = useStoreActions(
    (actions) => actions.userSettings,
  );
  const { setAutopilotEnabled } = useStoreActions((actions) => actions.app);
  const enabled = dataRecording === true;

  // STTM Data recording and Voice Autopilot are one or the other. Turning recording on hides
  // Autopilot and stops its mic (its tab and its own recording); turning it off brings back the
  // Autopilot settings from before. Turning Autopilot back on turns recording off.
  // Starts as 'off', so a launch with recording on also applies the rule.
  const prevRef = useRef({ dataRecording: false, voiceFollowEnabled });
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { dataRecording, voiceFollowEnabled };
    if (dataRecording === true && prev.dataRecording !== true) {
      try {
        if (!window.localStorage.getItem(AUTOPILOT_KEY)) {
          window.localStorage.setItem(
            AUTOPILOT_KEY,
            JSON.stringify({ voiceFollowEnabled, shadowRecording }),
          );
        }
      } catch (_) {
        /* restored as on */
      }
      setAutopilotEnabled(false);
      if (voiceFollowEnabled !== false) setVoiceFollowEnabled(false);
      if (shadowRecording !== false) setShadowRecording(false);
    } else if (dataRecording !== true && prev.dataRecording === true) {
      let before = { voiceFollowEnabled: true, shadowRecording: true };
      try {
        before = JSON.parse(window.localStorage.getItem(AUTOPILOT_KEY)) || before;
        window.localStorage.removeItem(AUTOPILOT_KEY);
      } catch (_) {
        /* defaults: on */
      }
      if (voiceFollowEnabled === false && before.voiceFollowEnabled !== false) {
        setVoiceFollowEnabled(true);
      }
      if (shadowRecording === false && before.shadowRecording !== false) setShadowRecording(true);
    } else if (
      dataRecording === true &&
      voiceFollowEnabled !== false &&
      prev.voiceFollowEnabled === false
    ) {
      setDataRecording(false);
    }
  }, [dataRecording, voiceFollowEnabled]);
  const isRecording = useRecordingState();
  const [prefs, setPrefs] = useState(null);
  const [kind, setKind] = useState(null);
  const [kindChoice, setKindChoice] = useState(null);
  const [visibility, setVisibility] = useState(null); // asked for every recording
  const [askVis, setAskVis] = useState(false);
  const [choice, setChoice] = useState(null);
  const [inputs, setInputs] = useState([]);
  const [device, setDevice] = useState('default');
  const [recDevice, setRecDevice] = useState(null); // the input being recorded from
  const [welcome, setWelcome] = useState(false);
  const [startAfter, setStartAfter] = useState(false);
  const [gurdwara, setGurdwara] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const welcomedRef = useRef(false); // the welcome card opens by itself once per launch
  // Live level: in the Record card for the chosen input, and while recording (Silent warning).
  const cardDevice = inputs.some((d) => d.id === device) ? device : (inputs[0] || {}).id;
  const cardLevel = useInputLevel(cardDevice, enabled && askVis && inputs.length > 0);
  const recLevel = useInputLevel(recDevice, enabled && isRecording && recDevice !== null);
  // The right end of the workspace bar (next to the Voice Autopilot mic chip), when it is there.
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    ipcRenderer.invoke('get-recording-settings').then((p) => {
      setPrefs(p);
      setGurdwara(p.gurdwaraName || '');
      if (!p.consentGiven && !welcomedRef.current) setWelcome(true);
      welcomedRef.current = true;
    });
  }, [refreshKey, enabled]);

  useEffect(() => {
    if (prefs) setSlot(document.querySelector('.workspace-bar-right'));
  }, [prefs]);

  // Switched off in Settings: stop any recording (it is kept and uploaded) and close the cards.
  useEffect(() => {
    if (enabled) return;
    if (isRecording) ipcRenderer.send('toggle-recording', {});
    setAskVis(false);
    setWelcome(false);
  }, [enabled]);

  useEffect(() => {
    const onToggle = (_e, state) => setStartedAt(state.isRecording ? state.startedAt : null);
    ipcRenderer.on('recording-toggle', onToggle);
    return () => ipcRenderer.removeListener('recording-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!isRecording) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [isRecording]);

  // Each recording: ask whether this diwan is online anywhere, then start.
  const askThenStart = () => {
    setChoice(null);
    setKindChoice(null);
    setDevice(savedDevice());
    listInputs().then(setInputs);
    setAskVis(true);
  };

  const startWith = (k, vis) => {
    setKind(k);
    setVisibility(vis);
    setAskVis(false);
    try {
      window.localStorage.setItem(DEVICE_KEY, device);
    } catch (_) {
      /* not remembered: asked again next time */
    }
    const chosen = inputs.find((d) => d.id === device) || inputs[0];
    const label = chosen ? chosen.label : '';
    setRecDevice(chosen ? chosen.id : 'default');
    ipcRenderer.send('toggle-recording', {
      kind: k,
      visibility: vis,
      mic: micKind(label), // inferred from the input's name
      micLabel: label,
    });
  };

  const toggle = () => {
    if (!enabled || !prefs) return;
    if (isRecording) {
      ipcRenderer.send('toggle-recording', {});
      return;
    }
    if (!prefs.consentGiven) {
      setStartAfter(true);
      setWelcome(true);
      return;
    }
    askThenStart();
  };

  const agree = () => {
    ipcRenderer
      .invoke('save-recording-settings', { gurdwaraName: gurdwara.trim() })
      .then(() => ipcRenderer.invoke('give-recording-consent'))
      .then((next) => {
        setPrefs(next);
        setWelcome(false);
        if (startAfter) askThenStart();
        setStartAfter(false);
      });
  };

  const handleKey = () => {
    if (searchRef && searchRef.current && document.activeElement === searchRef.current) return;
    toggle();
  };
  useKeys('KeyR', 'single', handleKey);

  if (!enabled || !prefs) return null;
  const kindLabel = (KINDS.find(([v]) => v === kind) || [])[1];

  const bar = (
    <div
      className={`recording-controls${isRecording ? ' is-recording' : ''}${slot ? ' in-bar' : ''}`}
    >
      <button
        type="button"
        className={`record-toggle${isRecording ? ' recording' : ''}`}
        title={isRecording ? 'Stop recording (R)' : 'Start recording (R)'}
        onClick={toggle}
      >
        <span className="dot" />
        {isRecording ? 'Stop' : 'Record'}
      </button>
      {isRecording && (
        <span className="recording-status">
          {kindLabel}
          {' · '}
          <i className={visibility === 'private' ? 'fa fa-lock' : 'fa fa-globe'} />{' '}
          {visibility === 'private' ? 'Private' : 'Public'}
          {' · '}
          <b>{startedAt ? fmt(Math.max(0, now - startedAt) / 1000) : '0:00'}</b>
          {' · '}
          <LevelMeter level={recLevel.level} heard={recLevel.heard} compact />
          {recLevel.heard === false && (
            <span className="mic-silent-warn">
              <i className="fa fa-exclamation-triangle" /> No sound
            </span>
          )}
        </span>
      )}
    </div>
  );

  return (
    <>
      {slot ? createPortal(bar, slot) : bar}
      {askVis && (
        <div className="recording-consent-backdrop" role="dialog" aria-modal="true">
          <div className="recording-consent recording-vis">
            <h3>What are you recording?</h3>
            <div className="vis-kinds">
              {KINDS.map(([v, label, icon, eg]) => (
                <button
                  key={v}
                  type="button"
                  className={`vis-option kind${kindChoice === v ? ' on' : ''}`}
                  onClick={() => setKindChoice(v)}
                >
                  <i
                    className={`fa ${kindChoice === v ? 'fa-check-circle' : 'fa-circle-thin'} tick`}
                  />
                  <i className={`fa ${icon} kind-icon`} />
                  <b>{label}</b>
                  <small>{eg}</small>
                </button>
              ))}
            </div>
            <h3>Is this diwan online anywhere?</h3>
            {VIS.map(([v, icon, title, text]) => (
              <button
                key={v}
                type="button"
                className={`vis-option ${v}${choice === v ? ' on' : ''}`}
                onClick={() => setChoice(v)}
              >
                <i className={`fa ${choice === v ? 'fa-check-circle' : 'fa-circle-thin'} tick`} />
                <i className={`fa ${icon}`} />
                <span>
                  <b>{title}</b>
                  <small>{text}</small>
                </span>
              </button>
            ))}
            {inputs.length > 0 && (
              <label className="mic-device" htmlFor="recording-mic-device">
                <span>Recording from</span>
                <select
                  id="recording-mic-device"
                  className="disable-kb-shortcuts"
                  value={inputs.some((d) => d.id === device) ? device : inputs[0].id}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  {inputs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {inputs.length > 0 &&
              (() => {
                // One short line under the input: how it sounds, then one tip. Never blocks Start;
                // a quiet mixer (nothing playing yet, a fader down) only gets a gentle check.
                const kindNow = micKind((inputs.find((d) => d.id === cardDevice) || {}).label);
                const { heard } = cardLevel;
                let tip = null;
                if (SHORT_WARN[kindNow]) {
                  tip = (
                    <span className="mic-note warn">
                      <i className="fa fa-exclamation-circle" /> {SHORT_WARN[kindNow]} The mixer is
                      best.
                    </span>
                  );
                } else if (heard === false) {
                  tip = (
                    <span className="mic-note quiet">
                      <i className="fa fa-info-circle" />{' '}
                      {kindNow === 'laptop'
                        ? 'No sound yet. Is the mic muted?'
                        : 'No sound yet. Check the mixer and cable.'}
                    </span>
                  );
                } else if (kindNow === 'laptop') {
                  tip = (
                    <span className="mic-note">
                      <i className="fa fa-lightbulb-o" /> Computer mic. The mixer is much clearer.
                    </span>
                  );
                } else if (kindNow === 'mixer') {
                  tip = (
                    <span className="mic-note good">
                      <i className="fa fa-check-circle" /> Mixer. Thank you!
                    </span>
                  );
                }
                return (
                  <div className="mic-status">
                    <LevelMeter level={cardLevel.level} heard={heard} compact />
                    <span className={`mic-heard${heard === true ? ' on' : ''}`}>
                      {HEARD_TEXT[String(heard)]}
                    </span>
                    {tip}
                  </div>
                );
              })()}
            <div className="recording-consent-actions">
              <button type="button" className="secondary" onClick={() => setAskVis(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!choice || !kindChoice}
                onClick={() => startWith(kindChoice, choice)}
              >
                Start recording
              </button>
            </div>
          </div>
        </div>
      )}
      {welcome && (
        <div className="recording-consent-backdrop" role="dialog" aria-modal="true">
          <div className="recording-consent">
            <h3>May we record, with your permission?</h3>
            <p className="recording-ask">
              You are doing the seva here, so we ask you. With your OK we save:
            </p>
            <ul className="recording-points">
              <li>
                <i className="fa fa-microphone" />
                The audio from when you press Record until Stop
              </li>
              <li>
                <i className="fa fa-list-ul" />
                The pangtis you show, and when
              </li>
              <li>
                <i className="fa fa-lock" />
                <span>
                  Mark it <b>Private</b> when this diwan is not livestreamed or posted anywhere (not
                  on YouTube, Instagram, Facebook...). Private is the most valuable, and never
                  trained on.
                </span>
              </li>
              <li>
                <i className="fa fa-heart" />
                Every recording makes Gurbani recognition better
              </li>
            </ul>
            <label className="recording-consent-field" htmlFor="recording-gurdwara">
              <input
                id="recording-gurdwara"
                className="disable-kb-shortcuts"
                value={gurdwara}
                placeholder="Gurdwara Sahib (optional)"
                onChange={(e) => setGurdwara(e.target.value)}
              />
            </label>
            <div className="recording-consent-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setWelcome(false);
                  setStartAfter(false);
                }}
              >
                Not now
              </button>
              <button type="button" className="primary" onClick={agree}>
                {startAfter ? 'Yes, record' : 'Yes, I agree'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

RecordingControls.propTypes = {
  refreshKey: PropTypes.string,
  searchRef: PropTypes.shape({ current: PropTypes.any }),
};

export default RecordingControls;
