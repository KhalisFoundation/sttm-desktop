import React from 'react';
import PropTypes from 'prop-types';

// Autopilot tab icon (Material Symbols "audio capture"). Uses currentColor so it
// follows the tab's text colour in every theme.
const AudioCaptureIcon = ({ size }) => (
  <svg
    className="audio-capture-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 -960 960 960"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M80-80v-400h80v205l46-45h114v80h-80L80-80Zm560-160v-80h160v-160h80v160q0 33-23.5 56.5T800-240H640ZM440-360v-400h80v400h-80Zm-160-80v-240h80v240h-80Zm320-40v-160h80v160h-80ZM80-640v-160q0-33 23.5-56.5T160-880h160v80H160v160H80Zm720 0v-160H640v-80h160q33 0 56.5 23.5T880-800v160h-80Z" />
  </svg>
);

AudioCaptureIcon.propTypes = {
  size: PropTypes.number,
};

AudioCaptureIcon.defaultProps = {
  size: 16,
};

export default AudioCaptureIcon;
