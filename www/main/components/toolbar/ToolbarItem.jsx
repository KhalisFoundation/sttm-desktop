import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../../constants';

export const ToolbarItem = ({ itemName }) => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);
  const isSelectedOverlay = overlayScreen === itemName;

  return (
    <div
      id={`tool-${itemName}`}
      className="toolbar-item"
      onClick={() => {
        if (isSelectedOverlay) {
          return setOverlayScreen(DEFAULT_OVERLAY);
        }

        setOverlayScreen(itemName);
      }}
    ></div>
  );
};

ToolbarItem.propTypes = {
  itemName: PropTypes.string.isRequired,
};
