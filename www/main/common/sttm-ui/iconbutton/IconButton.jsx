import React from 'react';
import PropTypes from 'prop-types';

const IconButton = ({ icon, onClick, className }) => (
  <button className={`icon-button ${className}`} onClick={onClick}>
    <i className={icon} />
  </button>
);

IconButton.propTypes = {
  icon: PropTypes.string,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

export default IconButton;
