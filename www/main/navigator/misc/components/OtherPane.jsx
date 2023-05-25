import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { randomShabad } from '../../../banidb';
import { dailyHukamnama } from '../../utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const OtherPane = ({ className }) => {
  const [isHukamnamaLoading, setIsHukamnamaLoading] = useState(false);
  const {
    activeShabadId,
    isRandomShabad,
    singleDisplayActiveTab,
    isSundarGutkaBani,
    isCeremonyBani,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setIsRandomShabad,
    setSingleDisplayActiveTab,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
  } = useStoreActions((state) => state.navigator);

  const setShabadId = (shabadId) => {
    if (!isRandomShabad) {
      setIsRandomShabad(true);
    }
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (activeShabadId !== shabadId) {
      setActiveShabadId(shabadId);
    }
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (isCeremonyBani) {
      setIsCeremonyBani(false);
    }
  };

  const openRandomShabad = () => {
    randomShabad().then((randomId) => {
      setShabadId(randomId);
    });
    analytics.trackEvent('display', 'random-shabad');
  };

  const openDailyHukamnana = () => {
    if (!isHukamnamaLoading) {
      dailyHukamnama(setIsHukamnamaLoading).then((hukamId) => {
        setIsHukamnamaLoading(false);
        setShabadId(hukamId);
        analytics.trackEvent('display', 'hukamnama', hukamId);
      });
    }
    setIsHukamnamaLoading(true);
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
