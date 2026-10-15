import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

// What the tester build records, said once on first launch (ShadowCollector.jsx) and again
// whenever the sevadaar clicks the "Recording audio" chip in the workspace bar. One text
// for both, so they can never drift apart. Keep it true to ShadowCollector.jsx (what is
// saved: session.json, machineFacts) and uploader.js / hf.js (what turning it off stops).
export const SETTING_PATH = 'Settings › Other Options › Voice Autopilot recording';

export const NoticeText = () => (
  <div className="shadow-notice-text">
    <p>To make Voice Autopilot better, this test version of STTM records:</p>
    <ul>
      <li>
        sound from the microphone while a program is going on (from when there is kirtan in the room
        or you change what is on screen), <b>even when Voice Autopilot is not in use</b>
      </li>
      <li>what is shown on screen (which Shabad or Bani, and which pangti)</li>
      <li>what Voice Autopilot heard, and what it would have shown</li>
    </ul>
    <p>
      It also saves the name and Gurdwara you enter, the computer&apos;s name and login name, its
      operating system, processor, time zone and language, the internet address (which gives an
      approximate location), the microphone&apos;s name, and a log of app errors.
    </p>
    <p>
      While STTM is open, the microphone stays on to notice when a program starts; the last 2
      minutes are kept in memory and saved only if a recording starts.
    </p>
    <p>Recordings are sent during the program to Khalis Foundation&apos;s secure storage.</p>
    <p>
      To turn it off: <b>{SETTING_PATH}</b>. Turning it off stops recording and sending at once
      (anything already being sent finishes). Anything recorded but not yet sent stays on this
      computer and is sent only if you turn recording back on.
    </p>
  </div>
);

// The short version for the first-launch card; the chip's popover keeps the full text.
export const ShortNotice = () => (
  <div className="shadow-notice-text">
    <p>This test version of STTM records audio to make Voice Autopilot better.</p>
    <ul>
      <li>
        <b>Recorded:</b> microphone sound during a program, even when Voice Autopilot is not in use;
        what is on screen; and what Voice Autopilot heard.
      </li>
      <li>
        <b>Also saved:</b> your name and Gurdwara, computer details, and an approximate location
        from the internet address.
      </li>
      <li>
        <b>Where:</b> sent to Khalis Foundation&apos;s secure storage, to improve Voice Autopilot.
      </li>
      <li>
        <b>To turn off:</b> {SETTING_PATH}. Recording and sending stop at once; anything not yet
        sent stays on this computer.
      </li>
    </ul>
  </div>
);

// The chip at the left of the workspace bar (controller window only, never the viewer):
// "Recording audio" while a session records, "Mic on" while only the listener is open.
// Clicking it shows the notice and the way to turn it off.
export const RecordingChip = ({ onOpenSettings }) => {
  const micState = useStoreState((state) => state.app.shadowMicState);
  const { setShadowRecording } = useStoreActions((actions) => actions.userSettings);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (micState !== 'recording' && micState !== 'listening') return null;
  const recording = micState === 'recording';

  return (
    <div className="shadow-rec" ref={ref}>
      <button
        type="button"
        className={`shadow-rec-chip ${recording ? 'is-recording' : 'is-listening'}`}
        title="What is recorded, and how to turn it off"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="shadow-rec-dot" />
        {recording ? 'Recording audio' : 'Mic on'}
      </button>
      {open && (
        <div className="shadow-rec-pop" role="dialog" aria-label="Voice Autopilot recording">
          <h4>
            {recording
              ? 'Voice Autopilot is recording audio'
              : 'Voice Autopilot is listening for a program'}
          </h4>
          <NoticeText />
          <div className="shadow-rec-actions">
            <button
              type="button"
              className="shadow-rec-link"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              Open Settings
            </button>
            <button
              type="button"
              className="shadow-rec-off"
              onClick={() => {
                setOpen(false);
                setShadowRecording(false);
              }}
            >
              Turn off recording
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

RecordingChip.propTypes = {
  onOpenSettings: PropTypes.func.isRequired,
};
