import React from 'react';
import PropTypes from 'prop-types';

const IconButton = ({ icon, onClick }) => {
  return (
    <button className="icon-button" onClick={onClick}>
      <i className={icon} />
    </button>
  );
};

IconButton.propTypes = {
  icon: PropTypes.string,
  onClick: PropTypes.func,
};

export default IconButton;
