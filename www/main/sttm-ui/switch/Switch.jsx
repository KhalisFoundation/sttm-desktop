import React, { useState } from 'react';
import PropTypes from 'prop-types';
export const Switch = ({ title, onToggleSwitch }) => {
  const [isSwitched, toggleSwitchedState] = useState(false);

  return (
    <div className="translit-switch">
      {title && <span>{title}</span>}
      <div className="switch">
        <input
          id="sg-translit-toggle"
          name="hg-trasnlit-toggle"
          type="checkbox"
          value="sg-translit"
          checked={isSwitched}
          onChange={() => {
            const newState = !isSwitched;
            toggleSwitchedState(newState);
            if (onToggleSwitch) {
              onToggleSwitch(newState);
            }
          }}
        />
        <label htmlFor="sg-translit-toggle" />
      </div>
    </div>
  );
};

Switch.propTypes = {
  title: PropTypes.string,
  onToggleSwitch: PropTypes.func,
};
