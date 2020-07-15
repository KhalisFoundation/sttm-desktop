import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import GlobalState from '../contexts/GlobalState';

function ToolbarItem(props) {
  const [, setState] = useContext(GlobalState);

  const setCurrentScreen = currentItem => {
    setState(prevState => ({ ...prevState, currentOverlayScreen: currentItem }));
  };

  return (
    <div
      className="toolbar-item"
      id={`tool-${props.itemName}`}
      onClick={() => setCurrentScreen(props.itemName)}
    >
      {console.log('here')}
    </div>
  );
}

ToolbarItem.propTypes = {
  itemName: PropTypes.string.isRequired,
};

export default ToolbarItem;
