import React from 'react';
import { remote } from 'electron';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const getSyncItems = ({ code, adminPin, toggleAdminPin, toggleLockScreen }) => [
  {
    title: i18n.t('TOOLBAR.SYNC_CONTROLLER.SANGAT_SYNC'),
    description: (
      <>
        {i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.1')},<strong>sttm.co/sync</strong>
        {i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.2')}
      </>
    ),
    control: (
      <button
        className="button copy-code-btn"
        onClick={() => {
          if (code !== '...') {
            const syncString = i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_STRING', { code });
            global.controller.sendText(syncString);
            analytics.trackEvent('controller', 'codePresented', true);
          }
        }}
      >
        {i18n.t('TOOLBAR.SYNC_CONTROLLER.PRESENT_CODE')}
      </button>
    ),
  },
  {
    title: i18n.t('TOOLBAR.BANI_CONTROLLER'),
    description: (
      <>
        {i18n.t('TOOLBAR.BANI_DESC.1')},
        <strong>
          <a href="https//sttm.co/control">sttm.co/control</a>
        </strong>
        ,{i18n.t('TOOLBAR.BANI_DESC.2')}
      </>
    ),
    control: (
      <div>
        <div className="large-text">
          <span className="admin-pin">
            {i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}: {adminPin}
          </span>
          <span className="hide-btn" onClick={toggleAdminPin}>
            <i className="fa fa-eye" />
          </span>
        </div>
        <button className="button lock-screen-btn" onClick={toggleLockScreen}>
          Lock Screen
        </button>
      </div>
    ),
  },
];

export default getSyncItems;
