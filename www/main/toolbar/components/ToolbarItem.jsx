import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../../common/constants';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ToolbarItem = ({ itemName }) => {
  const { overlayScreen, userToken } = useStoreState((state) => state.app);
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);
  const isSelectedOverlay = overlayScreen === itemName;
  const isAuthItem = itemName === 'auth-dialog';
  const displayName = {
    'sync-button': i18n.t('TOOLBAR.BANI_CONTROLLER'),
    'auth-dialog': i18n.t('AUTH.LOGIN_LABEL'),
    settings: i18n.t('TOOLBAR.SETTINGS'),
    'sunder-gutka': i18n.t('TOOLBAR.SUNDAR_GUTKA'),
    ceremonies: i18n.t('TOOLBAR.CEREMONIES'),
    announcement: i18n.t('QUICK_TOOLS.ANNOUNCEMENTS'),
  };

  return (
    <div
      id={`tool-${itemName}`}
      className={`toolbar-item ${isAuthItem && userToken ? 'auth-logged-in' : ''}`}
      title={displayName[itemName]}
      onClick={() => {
        document.body.classList.toggle(`overlay-${itemName}-active`, !isSelectedOverlay);
        if (isSelectedOverlay) {
          return setOverlayScreen(DEFAULT_OVERLAY);
        }

        return setOverlayScreen(itemName);
      }}
    ></div>
  );
};

ToolbarItem.propTypes = {
  itemName: PropTypes.string.isRequired,
};

export default ToolbarItem;
