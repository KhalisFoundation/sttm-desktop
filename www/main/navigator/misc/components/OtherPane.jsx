import React from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { randomShabad } from '../../../banidb';

const { i18n } = remote.require('./app');

function OtherPane() {
  const { activeShabadId } = useStoreState(state => state.navigator);
  const { setActiveShabadId } = useStoreActions(state => state.navigator);

  const openRandomShabad = () => {
    randomShabad().then(randomId => activeShabadId !== randomId && setActiveShabadId(randomId));
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
        <a>
          <i className="fa fa-gavel list-icon" />
          {i18n.t('OTHERS.DAILY_HUKAMNAMA')}
        </a>
      </li>
      <li>
        <a>
          <i className="fa fa-bell list-icon" />
          {i18n.t('OTHERS.WHATS_NEW')}
        </a>
      </li>
    </ul>
  );
}

export default OtherPane;
