import React, { useState } from 'react';
import PropTypes from 'prop-types';

const Switch = ({ title, controlId, wrapperClassName, onToggleSwitch }) => {
  const [isSwitched, toggleSwitchedState] = useState(false);

  return (
    <div className={wrapperClassName}>
      {title && <span>{title}</span>}
      <div className="switch">
        <input
          id={controlId}
          type="checkbox"
          checked={isSwitched}
          onChange={() => {
            const newState = !isSwitched;
            toggleSwitchedState(newState);
            if (onToggleSwitch) {
              onToggleSwitch(newState);
            }
          }}
        />
        <label htmlFor={controlId} />
      </div>
    </div>
  );
};

Switch.propTypes = {
  title: PropTypes.string,
  controlId: PropTypes.string,
  wrapperClassName: PropTypes.string,
  onToggleSwitch: PropTypes.func,
};

export default Switch;
