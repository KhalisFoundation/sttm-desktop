import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const Switch = ({ title, controlId, className, onToggle, value = false, disabled = false }) => {
  const [isSwitched, setSwitchedState] = useState(value);

  useEffect(() => {
    setSwitchedState(value);
  }, [value]);

  return (
    <div className={className}>
      {title && <span>{title}</span>}
      <div className="switch">
        <input
          id={controlId}
          type="checkbox"
          checked={isSwitched}
          onChange={() => {
            const newState = !isSwitched;
            setSwitchedState(newState);
            if (onToggle) {
              onToggle(newState);
            }
          }}
          disabled={disabled}
        />
        <label htmlFor={controlId} />
      </div>
    </div>
  );
};

Switch.propTypes = {
  title: PropTypes.string,
  controlId: PropTypes.string,
  className: PropTypes.string,
  value: PropTypes.bool,
  disabled: PropTypes.bool,
  onToggle: PropTypes.func,
};

export default Switch;
