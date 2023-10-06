import React from 'react';
import PropTypes from 'prop-types';

import { Overlay } from '../../../common/sttm-ui';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const LockScreen = ({ onScreenClose }) => (
  <Overlay onScreenClose={onScreenClose}>
    <div className="lock-screen-message"> {i18n.t('TOOLBAR.LOCKED_SCREEN')} </div>
  </Overlay>
);

LockScreen.propTypes = {
  onScreenClose: PropTypes.func,
};

export default LockScreen;
