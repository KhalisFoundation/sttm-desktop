import React from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { randomShabad } from '../../../banidb';
import { dailyHukamnama, getNotifications, showNotificationsModal } from '../../utils';

const electron = require('electron');

const { i18n } = remote.require('./app');
const analytics = electron.remote.getGlobal('analytics');

export const OtherPane = () => {
  const { activeShabadId, noActiveVerse } = useStoreState(state => state.navigator);
  const { setActiveShabadId, setNoActiveVerse } = useStoreActions(state => state.navigator);

  const openRandomShabad = () => {
    randomShabad().then(randomId => activeShabadId !== randomId && setActiveShabadId(randomId));
  };

  const openDailyHukamnana = () => {
    dailyHukamnama(activeShabadId, setActiveShabadId);
    if (!noActiveVerse) {
      setNoActiveVerse(true);
    }
  };

  const openWhatsNew = () => {
    analytics.trackEvent('display', 'notifications');
    getNotifications(null, showNotificationsModal);
  };

  return (
    <ul className="list-of-items">
      <li>
        <a onClick={openRandomShabad}>
          <i className="fa fa-random list-icon" />
          {i18n.t('OTHERS.SHOW_RANDOM_SHABAD')}
        </a>
      </li>
      <li>
        <a onClick={openDailyHukamnana}>
          <i className="fa fa-gavel list-icon" />
          {i18n.t('OTHERS.DAILY_HUKAMNAMA')}
        </a>
      </li>
      <li>
        <a onClick={openWhatsNew}>
          <i className="fa fa-bell list-icon" />
          {i18n.t('OTHERS.WHATS_NEW')}
        </a>
      </li>
    </ul>
  );
};
