import React from 'react';

const DialogWrapper = ({ onDialogClose, children }) => {
  return (
    <div className="backdrop">
      <button className="close-dialog" onClick={onDialogClose}>
        <i className="fa fa-times" />
      </button>
      {children}
    </div>
  );
};

export default DialogWrapper;
