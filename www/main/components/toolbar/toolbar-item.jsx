import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions } from 'easy-peasy';

function ToolbarItem(props) {
  const { toggleOverlayScreen } = useStoreActions(actions => actions.toolbar);

  return (
    <div
      className="toolbar-item"
      id={`tool-${props.itemName}`}
      onClick={() => toggleOverlayScreen(props.itemName)}
    ></div>
  );
}

ToolbarItem.propTypes = {
  itemName: PropTypes.string.isRequired,
};

export default ToolbarItem;
