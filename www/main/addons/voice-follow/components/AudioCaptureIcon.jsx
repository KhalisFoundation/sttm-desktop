import React from 'react';
import PropTypes from 'prop-types';

// Autopilot tab icon: four corner brackets around a three-bar sound wave. Uses currentColor so it
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
    <path d="M80-640v-160q0-33 23.5-56.5T160-880h160v80H160v160H80Zm720 0v-160H640v-80h160q33 0 56.5 23.5T880-800v160h-80ZM640-80v-80h160v-160h80v160q0 33-23.5 56.5T800-80H640Zm-480 0q-33 0-56.5-23.5T80-160v-160h80v160h160v80H160Zm280-200v-400h80v400h-80Zm-160-80v-240h80v240h-80Zm320 0v-240h80v240h-80Z" />
  </svg>
);

AudioCaptureIcon.propTypes = {
  size: PropTypes.number,
};

AudioCaptureIcon.defaultProps = {
  size: 16,
};

export default AudioCaptureIcon;
