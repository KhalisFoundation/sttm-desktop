import React from 'react';
import PropTypes from 'prop-types';

const Overlay = ({ onClose, children }) => {
  return (
    <div className="backdrop">
      <button className="close-screen" onClick={onClose}>
        <i className="fa fa-times" />
      </button>
      {children}
    </div>
  );
};

Overlay.propTypes = {
  onClose: PropTypes.func,
};

export default Overlay;
