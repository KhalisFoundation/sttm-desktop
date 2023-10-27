import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../../common/constants';

const ToolbarItem = ({ itemName }) => {
  const { overlayScreen, userToken } = useStoreState((state) => state.app);
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);
  const isSelectedOverlay = overlayScreen === itemName;
  const isAuthItem = itemName === 'auth-dialog';

  return (
    <div
      id={`tool-${itemName}`}
      className={`toolbar-item ${isAuthItem && userToken ? 'auth-logged-in' : ''}`}
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
