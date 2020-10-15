import React from 'react';
import PropTypes from 'prop-types';

const Overlay = ({ onScreenClose, children }) => {
  return (
    <div className="backdrop">
      {children}
      <button className="close-screen" onClick={onScreenClose}>
        <i className="fa fa-times" />
      </button>
    </div>
  );
};

Overlay.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Overlay;
