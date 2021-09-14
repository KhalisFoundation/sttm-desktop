import React from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { randomShabad } from '../../../banidb';
import { dailyHukamnama } from '../../utils';

const { i18n } = remote.require('./app');

export const OtherPane = () => {
  const { activeShabadId, noActiveVerse, isRandomShabad } = useStoreState(state => state.navigator);
  const { setActiveShabadId, setNoActiveVerse, setIsRandomShabad } = useStoreActions(
    state => state.navigator,
  );

  const openRandomShabad = () => {
    if (!isRandomShabad) {
      setIsRandomShabad(true);
    }
    randomShabad().then(randomId => activeShabadId !== randomId && setActiveShabadId(randomId));
  };

  const openDailyHukamnana = () => {
    dailyHukamnama(activeShabadId, setActiveShabadId);
    if (!noActiveVerse) {
      setNoActiveVerse(true);
    }
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
    </ul>
  );
};
