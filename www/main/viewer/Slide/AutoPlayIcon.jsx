import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import { useKeys } from '../../common/hooks';
import { MIN_SPEED, MAX_SPEED, SPEED_STEP } from '../akhandpatt/scroll-config';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

/**
 * The Akhand Paatth scroll control: play/pause, a speed slider and two steppers.
 *
 * It keeps the `AutoPlayIcon` name, and the `autoplay-*` class names below, from
 * when it was a bare play button. Those names are shared with the
 * `autoplayToggle` user setting it reads and writes, so renaming the file alone
 * would separate it from the setting it is named after, and renaming the setting
 * would migrate persisted user data for a cosmetic gain.
 */

const SIZE = 40;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;

const PlayIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 5 Q7 12 8 19 Q12 17 18 12 Q12 7 8 5 Z" fill="currentColor" />
  </svg>
);

PlayIcon.propTypes = {
  size: PropTypes.number,
};

const PauseIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="6" y="4" width="4" height="16" fill="currentColor" rx="2" ry="2" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" rx="2" ry="2" />
  </svg>
);

PauseIcon.propTypes = {
  size: PropTypes.number,
};

// The steppers draw their glyphs rather than setting them as text. A text `+` or
// minus sign is placed by the font's own metrics, with the baseline above the
// box centre and the descent reserved below it, so inside a small round button
// the mark lands visibly low by an amount that varies with whichever font the
// platform resolves. Drawing them centres the mark on the button by
// construction, makes the weight explicit rather than a property of the font,
// and matches how the play and pause marks above are already done.
const STEP_ICON_STROKE = 3.5;

const PlusIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={STEP_ICON_STROKE}
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

PlusIcon.propTypes = {
  size: PropTypes.number,
};

const MinusIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={STEP_ICON_STROKE}
    strokeLinecap="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

MinusIcon.propTypes = {
  size: PropTypes.number,
};

const AutoPlayIcon = ({ isSingleDisplay, minimizedBySingleDisplay }) => {
  const { autoplayToggle, akhandpattScrollSpeed } = useStoreState((state) => state.userSettings);

  // The slider is driven by local state so the thumb tracks the drag instantly.
  // Binding it straight to `akhandpattScrollSpeed` made it feel broken: that
  // value only updates after a viewer->main->store->viewer IPC round-trip, so the
  // lagging store value fought the drag and snapped the thumb to a stale spot
  // (drag to 25, land on 28), which read as the controls freezing.
  const [localSpeed, setLocalSpeed] = useState(akhandpattScrollSpeed);
  // The last value we pushed to the store. Distinguishing our own echo (store
  // catching up to what we sent) from a genuinely external change (the other
  // window, or the persisted value on mount) stops the reconcile effect below
  // from clobbering an in-progress drag.
  const lastSentRef = useRef(akhandpattScrollSpeed);
  // True while the user is physically dragging the thumb. During a drag the
  // local value is authoritative and store echoes (which lag behind by a
  // viewer->main->store->viewer round-trip and can even arrive out of order) must
  // be ignored, otherwise a stale echo snaps the thumb backwards mid-drag.
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    if (akhandpattScrollSpeed !== lastSentRef.current) {
      lastSentRef.current = akhandpattScrollSpeed;
      setLocalSpeed(akhandpattScrollSpeed);
    }
  }, [akhandpattScrollSpeed]);

  const toggleAutoplay = () => {
    const globalObj = {
      actionName: 'setAutoplayToggle',
      payload: !autoplayToggle,
      settingType: 'userSettings',
    };
    global.platform.ipc.send('update-global-setting', JSON.stringify(globalObj));
  };

  const handleSpeedChange = (value) => {
    const newSpeed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(value)));
    setLocalSpeed(newSpeed);
    if (newSpeed !== lastSentRef.current) {
      lastSentRef.current = newSpeed;
      const globalObj = {
        actionName: 'setAkhandpattScrollSpeed',
        payload: newSpeed,
        settingType: 'userSettings',
      };
      global.platform.ipc.send('update-global-setting', JSON.stringify(globalObj));
    }
  };

  useKeys('Space', 'single', toggleAutoplay);

  // A slider is quick to reach a rough pace with but hard to place exactly: one
  // pixel of travel is nearly a whole step, so the last few units of a
  // correction are guesswork. The steppers give the operator an exact,
  // repeatable nudge for settling on the Granthi's pace once they are close.
  const stepButton = (direction) => {
    const isDecrement = direction === 'down';
    const next = isDecrement ? localSpeed - SPEED_STEP : localSpeed + SPEED_STEP;
    const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, next));

    return (
      <button
        type="button"
        aria-label={i18n.t(isDecrement ? 'AUTOPLAY.SPEED_DOWN' : 'AUTOPLAY.SPEED_UP')}
        className="autoplay-speed-step"
        disabled={clamped === localSpeed}
        onClick={() => handleSpeedChange(clamped)}
      >
        {isDecrement ? <MinusIcon /> : <PlusIcon />}
      </button>
    );
  };

  return (
    <div
      className={`autoplay-icon-container${isSingleDisplay ? ' single-display' : ''}${
        minimizedBySingleDisplay ? ' single-display-minimized' : ''
      }`}
    >
      <button
        aria-label={i18n.t(autoplayToggle ? 'AUTOPLAY.PAUSE' : 'AUTOPLAY.START')}
        onClick={toggleAutoplay}
        className="autoplay-icon-btn"
      >
        <svg width={SIZE} height={SIZE}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            className="bg-circle"
            strokeWidth={STROKE}
            fill="none"
          />
        </svg>
        <span className="play-pause-container">
          {autoplayToggle ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </span>
      </button>
      {stepButton('down')}
      <input
        aria-label={i18n.t('AUTOPLAY.SPEED')}
        className="autoplay-speed-slider"
        type="range"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step="1"
        value={localSpeed}
        onPointerDown={() => {
          draggingRef.current = true;
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onBlur={() => {
          draggingRef.current = false;
        }}
        onChange={(event) => handleSpeedChange(event.target.value)}
      />
      {stepButton('up')}
      <output className="speed-display" aria-label={i18n.t('AUTOPLAY.SPEED_CURRENT')}>
        {localSpeed}
      </output>
    </div>
  );
};

AutoPlayIcon.propTypes = {
  isSingleDisplay: PropTypes.bool,
  minimizedBySingleDisplay: PropTypes.bool,
};

export default AutoPlayIcon;
