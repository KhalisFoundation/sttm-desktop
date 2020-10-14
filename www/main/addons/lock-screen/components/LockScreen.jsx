import React from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

import { Overlay } from '../../../sttm-ui';

const { i18n } = remote.require('./app');

const LockScreen = ({ onScreenClose }) => {
  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="lock-screen-message"> {i18n.t('TOOLBAR.LOCKED_SCREEN')} </div>
    </Overlay>
  );
};

LockScreen.propTypes = {
  onScreenClose: PropTypes.func,
};

export default LockScreen;
