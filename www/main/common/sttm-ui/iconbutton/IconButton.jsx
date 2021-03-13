import React from 'react';

function IconButton({ icon, onClick }) {
  return (
    <button className="icon-button" onClick={onClick}>
      <i className={icon} />
    </button>
  );
}

export default IconButton;
