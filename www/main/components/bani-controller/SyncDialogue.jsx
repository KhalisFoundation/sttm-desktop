import React from 'react';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

function SyncItemFactory(props) {
  return (
    <div className="sync-item">
      <div className="sync-item-left">
        <div className="sync-item-head"> {props.title} </div>
        <div className="sync-item-description">{props.description} </div>
      </div>
      <div className="sync-item-right"> {props.controls} </div>
    </div>
  );
}

function SyncDialogue() {
  return (
    <div className="sync-dialogue-wrapper overlay-ui ui-sync-button">
      <div className="sync-dialogue  overlay-ui ui-sync-button">
        <header className="sync-header" data-key="MOBILE_DEVICE_SYNC"></header>
        <div className="sync-content-wrapper">
          <div className="sttm-loader"></div>
          <div className="sync-content">
            <div className="sync-code-label">
              {i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')}
            </div>
            <div className="sync-code-num"> ABC_DEF </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SyncDialogue;
