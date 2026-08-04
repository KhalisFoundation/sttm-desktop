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
    isMiscSlide,
    singleDisplayActiveTab,
    isSundarGutkaBani,
    isCeremonyBani,
    activePaneId,
    pane1,
    pane2,
    pane3,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setIsRandomShabad,
    setIsMiscSlide,
    setSingleDisplayActiveTab,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setPane1,
    setPane2,
    setPane3,
  } = useStoreActions((state) => state.navigator);

  const { defaultPaneId } = useStoreState((state) => state.userSettings);

  const setShabadId = (shabadId) => {
    // The viewer renders nothing but the misc slide while this is set, so leaving
    // it would silently swallow the click. See `viewer-entry-points.test.js`.
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
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
    const currentPane = activePaneId || defaultPaneId;
    if (currentPane === 1) {
      setPane1({
        ...pane1,
        activeShabad: shabadId,
        content: i18n.t('MULTI_PANE.SHABAD'),
        baniType: 'shabad',
      });
    } else if (currentPane === 2) {
      setPane2({
        ...pane2,
        activeShabad: shabadId,
        content: i18n.t('MULTI_PANE.SHABAD'),
        baniType: 'shabad',
      });
    } else if (currentPane === 3) {
      setPane3({
        ...pane3,
        activeShabad: shabadId,
        content: i18n.t('MULTI_PANE.SHABAD'),
        baniType: 'shabad',
      });
    }
  };

  const openRandomShabad = () => {
    randomShabad().then((randomId) => {
      setShabadId(randomId);
      analytics.trackEvent({
        category: 'display',
        action: 'random-shabad',
        label: 'shabadId',
        value: randomId,
      });
    });
  };

  const openDailyHukamnana = () => {
    if (!isHukamnamaLoading) {
      dailyHukamnama(setIsHukamnamaLoading).then((hukamId) => {
        setIsHukamnamaLoading(false);
        setShabadId(hukamId);
        analytics.trackEvent({
          category: 'display',
          action: 'hukamnama',
          label: 'shabadId',
          value: hukamId,
        });
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
