import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

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

const AutoPlayIcon = () => {
  const { autoplayToggle, autoplayDelay } = useStoreState((state) => state.userSettings);

  const toggleAutoplay = () => {
    const globalObj = {
      actionName: 'setAutoplayToggle',
      payload: !autoplayToggle,
      settingType: 'userSettings',
    };
    global.platform.ipc.send('update-global-setting', JSON.stringify(globalObj));
  };

  const handleSpeedChange = (sum) => {
    const newDelay = autoplayDelay + sum;
    if (newDelay !== autoplayDelay && newDelay > 0 && newDelay <= 20) {
      const globalObj = {
        actionName: 'setAutoplayDelay',
        payload: newDelay,
        settingType: 'userSettings',
      };
      global.platform.ipc.send('update-global-setting', JSON.stringify(globalObj));
    }
  };

  return (
    <div className="autoplay-icon-container">
      <button
        className={`${autoplayDelay <= 1 ? 'disabled' : ''} decrease-speed-btn`}
        aria-label="Decrease speed"
        style={{
          display: autoplayToggle ? 'initial' : 'none',
        }}
        onClick={() => {
          handleSpeedChange(-1);
        }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="7" y="11" width="10" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
      <div className="autoplay-center-container">
        <div className="speed-display">{autoplayDelay}s</div>
        <button
          aria-label={autoplayToggle ? 'Pause autoplay' : 'Start autoplay'}
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
      </div>
      <button
        className={`${autoplayDelay >= 20 ? 'disabled' : ''} increase-speed-btn`}
        aria-label="Increase speed"
        style={{
          display: autoplayToggle ? 'initial' : 'none',
        }}
        onClick={() => {
          handleSpeedChange(1);
        }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="11" y="7" width="2" height="10" rx="1" fill="currentColor" />
          <rect x="7" y="11" width="10" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
};

export default AutoPlayIcon;
