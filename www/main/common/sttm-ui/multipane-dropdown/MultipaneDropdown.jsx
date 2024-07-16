import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const MultipaneDropdown = ({
  paneSelectorActive,
  setPaneSelectorActive,
  paneSelector,
  clickHandler,
}) => {
  const { pane1, pane2, pane3 } = useStoreState((state) => state.navigator);
  const dropdownOptions = [pane1, pane2, pane3].map((item, index) => (
    <p
      key={`pane-option-${index + 1}`}
      onClick={(e) => {
        if (!item.locked) {
          clickHandler(e, index + 1);
        }
      }}
      title={item.locked ? i18n.t('MULTI_PANE.LOCKED_PANE_MSG') : ''}
      className={`history-item option-pane-${index + 1} ${item.locked ? 'locked-option' : ''}`}
    >
      {`Pane ${index + 1}`}
      {item.locked ? (
        <i style={{ fontSize: '12px', marginLeft: '8px' }} className="fa-solid fa-lock"></i>
      ) : (
        ''
      )}
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
  paneSelector: PropTypes.object,
  clickHandler: PropTypes.func,
};

export default MultipaneDropdown;
