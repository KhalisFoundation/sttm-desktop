import React from 'react';
export const SyncItem = ({ title, description, control }) => {
  return (
    <div className="sync-item">
      <div className="sync-item-left">
        <div className="sync-item-head"> {title} </div>
        <div className="sync-item-description">{description}</div>
      </div>
      <div className="sync-item-right"> {control} </div>
    </div>
  );
};
