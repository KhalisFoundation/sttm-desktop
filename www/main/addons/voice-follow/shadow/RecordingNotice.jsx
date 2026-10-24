import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import Noty from 'noty';
import CollectorBoundary from './Boundary';

const remoteConfig = require('./remote');

// The server switch for this install (remote.js), re-read every 30 s: "Sharing" shows only
// while collection is actually on, never while the switch has it off.
const useSwitchOn = () => {
  const [on, setOn] = useState(remoteConfig.enabled());
  useEffect(() => {
    const t = setInterval(() => setOn(remoteConfig.enabled()), 30000);
    return () => clearInterval(t);
  }, []);
  return on;
};

// What the tester build records, said once on first launch (ShadowCollector.jsx) and again
// whenever the sevadaar clicks the "Recording audio" chip in the workspace bar. One text
// for both, so they can never drift apart. Keep it true to ShadowCollector.jsx (what is
// saved: session.json, machineFacts) and uploader.js (what turning it off stops).
export const SETTING_PATH = 'Settings › Other Options › Help improve Shabad search';
// Bump when the first-launch notice changes in substance, so every sevadaar is asked again once.
// Until the ask has been answered for this version, nothing runs and no indicator shows.
export const NOTICE_VERSION = 2;

export const NoticeText = ({ audio = true }) => (
  <div className="shadow-notice-text">
    <p>To improve Shabad search, STTM shares with Khalis Foundation:</p>
    <ul>
      {audio && (
        <li>
          sound from the microphone during a diwan (from when there is kirtan in the room or you
          change what is on screen), <b>without you pressing anything</b>
        </li>
      )}
      <li>what is shown on screen (which Shabad or Bani, and which pangti), and when</li>
    </ul>
    <p>
      It also saves the Gurdwara (and name, if you enter one), a random id for this install, the
      computer&apos;s operating system, processor, memory, time zone and language, the
      microphone&apos;s name, and a log of app errors. No computer name, login name or internet
      address.
    </p>
    <p>
      While STTM is open, the microphone stays on to notice when a diwan starts; the last 2 minutes
      are kept in memory
      {audio ? ' and saved only if a recording starts' : ' and never saved'}.
    </p>
    <p>Sessions are sent during the diwan to Khalis Foundation&apos;s secure storage.</p>
    <p>
      To turn it off: <b>{SETTING_PATH}</b>. Turning it off stops recording and sending at once
      (anything already being sent finishes). Anything recorded but not yet sent stays on this
      computer and is sent only if you turn recording back on.
    </p>
  </div>
);

// The short version for the first-launch card; the chip's popover keeps the full text.
export const ShortNotice = ({ audio = true }) => (
  <div className="shadow-notice-text">
    <p>To improve Shabad search, STTM shares:</p>
    <ul>
      {audio && <li>the microphone during a diwan, automatically</li>}
      <li>what is on screen (Shabad or Bani, pangti) and when</li>
      <li>
        your Gurdwara Sahib (if given), a random install id and basic computer details (no name or
        address)
      </li>
    </ul>
    <p>Sent to Khalis Foundation&apos;s secure storage.</p>
    <p>
      Turn off any time: <b>{SETTING_PATH}</b>
    </p>
  </div>
);

// Closes a popover on a click outside it or Escape.
const useCloseOnOutside = (open, setOpen, ref) => {
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
  }, [open, setOpen, ref]);
};

// Settings > Other Options > Help improve Shabad search, scrolled into view.
const useOpenSharingSetting = () => {
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);
  return () => {
    setOverlayScreen('settings');
    setTimeout(() => {
      const el = document.getElementById('collector-level');
      if (el) el.scrollIntoView({ block: 'center' });
    }, 300);
  };
};

// The popover: the notice, the way to turn sharing off. One for the top-bar chip (tester
// build) and the footer indicator (prod collector), so they can never drift apart.
const SharingPopover = ({ title, audio, onClose, style }) => {
  const [more, setMore] = useState(false);
  const { setCollectorLevel } = useStoreActions((actions) => actions.userSettings);
  const openSetting = useOpenSharingSetting();
  return (
    <div className="shadow-rec-pop" role="dialog" aria-label="Shabad search sharing" style={style}>
      <h4>{title}</h4>
      <ShortNotice audio={audio} />
      <button
        type="button"
        className="shadow-rec-more"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        {more ? 'Hide details' : 'More details'}
      </button>
      {more && <NoticeText audio={audio} />}
      <div className="shadow-rec-actions">
        <button
          type="button"
          className="shadow-rec-link"
          onClick={() => {
            onClose();
            openSetting();
          }}
        >
          Open Settings
        </button>
        <button
          type="button"
          className="shadow-rec-off"
          onClick={() => {
            onClose();
            setCollectorLevel('off');
            // The indicator disappears with sharing off; say so, and how to turn it back on.
            new Noty({
              type: 'info',
              text: `Sharing turned off. To turn it back on: ${SETTING_PATH}`,
              timeout: 5000,
            }).show();
          }}
        >
          Stop sharing
        </button>
      </div>
    </div>
  );
};
SharingPopover.propTypes = {
  title: PropTypes.string.isRequired,
  audio: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  style: PropTypes.shape({}),
};

// Tester build: the chip at the right of the workspace bar (controller window only, never the
// viewer): "Recording Audio" / "Sharing labels" while a session records, "Mic On" while only
// the listener is open. Clicking it shows the notice and the way to turn it off.
const RecordingChipInner = () => {
  const micState = useStoreState((state) => state.app.shadowMicState);
  const audio = useStoreState((state) => state.userSettings.collectorLevel) === 'audio';
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useCloseOnOutside(open, setOpen, ref);

  if (micState !== 'recording' && micState !== 'listening') return null;
  const recording = micState === 'recording';
  let chipText = 'Mic On';
  if (recording) chipText = audio ? 'Recording Audio' : 'Sharing labels';

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
        {chipText}
      </button>
      {open && (
        <SharingPopover
          title={recording ? chipText : 'Mic On, waiting for a diwan'}
          audio={audio}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

// A render fault in the chip unmounts the chip, never the workspace bar.
export const RecordingChip = () => (
  <CollectorBoundary name="RecordingChip">
    <RecordingChipInner />
  </CollectorBoundary>
);

// Prod collector: a quiet indicator next to the source names in the search footer (in
// Single-Display: in the bottom tab bar, which is always visible): a dot and the word
// "Sharing", grey while idle (sharing on, no session), Kesari while a diwan is being shared.
// Hidden when sharing is off and until the first-launch ask has been answered. Same popover as
// the chip; it is placed on the window (fixed), so the pane it sits in can never clip it.
const POP_WIDTH = 360;
const popoverPlace = (btn) => {
  if (!btn) return undefined;
  const r = btn.getBoundingClientRect();
  const width = Math.min(POP_WIDTH, window.innerWidth - 32);
  return {
    position: 'fixed',
    left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)),
    bottom: window.innerHeight - r.top + 8,
    top: 'auto',
    right: 'auto',
    width,
    maxHeight: Math.max(160, r.top - 24),
  };
};
const SharingIndicatorInner = () => {
  const micState = useStoreState((state) => state.app.shadowMicState);
  const { collectorLevel: level, shadowNotice } = useStoreState((state) => state.userSettings);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const switchOn = useSwitchOn();
  useCloseOnOutside(open, setOpen, ref);
  if (!switchOn) return null;
  if (level !== 'labels' && level !== 'audio') return null;
  if (Number(shadowNotice) < NOTICE_VERSION) return null;
  const sharing = micState === 'recording';
  const audio = level === 'audio';
  let title = 'Sharing is on, waiting for a diwan';
  if (sharing) title = audio ? 'Sharing audio and labels' : 'Sharing labels';
  return (
    <div className={`shadow-share ${sharing ? 'is-sharing' : 'is-idle'}`} ref={ref}>
      <button
        type="button"
        ref={btnRef}
        className="shadow-share-btn"
        title={`${title}. Click for details and to turn it off.`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="shadow-share-dot" />
        Sharing
      </button>
      {open && (
        <SharingPopover
          title={title}
          audio={audio}
          onClose={() => setOpen(false)}
          style={popoverPlace(btnRef.current)}
        />
      )}
    </div>
  );
};
export const SharingIndicator = () => (
  <CollectorBoundary name="SharingIndicator">
    <SharingIndicatorInner />
  </CollectorBoundary>
);

NoticeText.propTypes = { audio: PropTypes.bool };
ShortNotice.propTypes = { audio: PropTypes.bool };
