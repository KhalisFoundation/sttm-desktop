import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { randomShabad } from '../../../banidb';
import { dailyHukamnama } from '../../utils';

const remote = require('@electron/remote');
const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const OtherPane = ({ className }) => {
  const { activeShabadId, isRandomShabad, singleDisplayActiveTab } = useStoreState(
    state => state.navigator,
  );
  const { setActiveShabadId, setIsRandomShabad, setSingleDisplayActiveTab } = useStoreActions(
    state => state.navigator,
  );

  const openRandomShabad = () => {
    if (!isRandomShabad) {
      setIsRandomShabad(true);
    }
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    randomShabad().then(randomId => activeShabadId !== randomId && setActiveShabadId(randomId));
    analytics.trackEvent('display', 'random-shabad');
  };

  const openDailyHukamnana = () => {
    dailyHukamnama(activeShabadId, setActiveShabadId);
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (!isRandomShabad) {
      setIsRandomShabad(true);
    }
  };

  return (
    <ul className={`list-of-items ${className}`}>
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

OtherPane.propTypes = {
  className: PropTypes.string,
};
