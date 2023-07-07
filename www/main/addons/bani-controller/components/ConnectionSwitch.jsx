import React from 'react';
import PropTypes from 'prop-types';
import { Switch } from '../../../common/sttm-ui';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

const ConnectionSwitch = (props) => (
  <div className="connection-switch-container">
    <p>Disable all the remote connections to SikhiToTheMax</p>
    <Switch
      controlId="bani-controller"
      onToggle={() => {
        props.syncToggle();
        analytics.trackEvent({
          category: 'controller',
          action: 'connection',
          label: props.isConnected ? 'Enabled' : 'Disabled',
        });
      }}
      value={!props.isConnected}
    />
  </div>
);

ConnectionSwitch.propTypes = {
  isConnected: PropTypes.bool,
  syncToggle: PropTypes.func,
};

export default ConnectionSwitch;
