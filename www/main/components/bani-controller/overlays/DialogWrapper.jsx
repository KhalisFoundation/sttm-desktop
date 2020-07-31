import React from 'react';

export const DialogWrapper = ({ onDialogClose, children }) => {
  return (
    <div className="backdrop">
      <button style={{ width: 100, height: 100 }} className="dialog-close" onClick={onDialogClose}>
        close
      </button>
      {children}
    </div>
  );
};
