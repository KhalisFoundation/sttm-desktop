import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const MultipaneDropdown = ({
  paneSelectorActive,
  setPaneSelectorActive,
  paneSelector,
  clickHandler,
}) => {
  const { pane1, pane2, pane3 } = useStoreState((state) => state.navigator);
  const dropdownOptions = [pane1, pane2, pane3].map((item, index) => (
    <p
      key={`pane-option-${index}`}
      onClick={() => {
        clickHandler(index + 1);
      }}
      className={`history-item pane-option-${index + 1}`}
    >
      Pane {index + 1}
    </p>
  ));
  return (
    <div
      className={`history-results multipane-dropdown ${
        paneSelectorActive ? 'enabled' : 'disabled'
      }`}
      ref={paneSelector}
      onMouseLeave={() => setPaneSelectorActive(false)}
    >
      {dropdownOptions}
    </div>
  );
};

MultipaneDropdown.propTypes = {
  paneSelectorActive: PropTypes.bool,
  setPaneSelectorActive: PropTypes.func,
  paneSelector: PropTypes.node,
  clickHandler: PropTypes.func,
};

export default MultipaneDropdown;
