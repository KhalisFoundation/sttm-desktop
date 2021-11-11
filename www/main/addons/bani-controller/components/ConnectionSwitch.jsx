import React from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import { Switch } from '../../../common/sttm-ui';

const analytics = remote.getGlobal('analytics');

const ConnectionSwitch = props => {
  return (
    <div className="connection-switch-container">
      <p>Disable all the remote connections to SikhiToTheMax</p>
      <Switch
        controlId="bani-controller"
        onToggle={() => {
          props.syncToggle();
          analytics.trackEvent(
            'controller',
            'connection',
            props.isConnected ? 'Enabled' : 'Disabled',
          );
        }}
        value={!props.isConnected}
      />
    </div>
  );
};

ConnectionSwitch.propTypes = {
  isConnected: PropTypes.bool,
  syncToggle: PropTypes.func,
};

export default ConnectionSwitch;
