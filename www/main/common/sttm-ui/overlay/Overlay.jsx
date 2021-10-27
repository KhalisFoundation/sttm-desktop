import React from 'react';
import PropTypes from 'prop-types';

const Overlay = ({ onScreenClose, children, className }) => {
  return (
    <div className={`backdrop ${className}`} onClick={onScreenClose}>
      {children}
      <button className="close-screen" onClick={onScreenClose}>
        <i className="fa fa-times" />
      </button>
    </div>
  );
};

Overlay.propTypes = {
  onScreenClose: PropTypes.func,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default Overlay;
