import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';
import { classNames } from '../../../common/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');
const { gurus } = insertSlide.dropdownStrings;

export const DhanGuruPane = ({ className }) => {
  const { isMiscSlide, miscSlideText, isAnnoucement } = useStoreState((state) => state.navigator);
  const { setIsMiscSlide, setMiscSlideText, setIsAnnoucement } = useStoreActions(
    (state) => state.navigator,
  );
  const { shortcutTray } = useStoreState((state) => state.userSettings);

  const refsByGuruIndex = useMemo(() => {
    const refs = {};
    gurus.forEach((guru) => {
      refs[guru] = React.createRef(null);
    });
    return refs;
  }, [gurus]);

  const addMiscSlide = (givenText) => {
    if (!isMiscSlide) {
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const addDhanGuruSlide = (e) => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    if (typeof e === 'object') {
      addMiscSlide(e.target.value);
      analytics.trackEvent('display', 'dhanguru-slide', e.target.value);
    } else {
      addMiscSlide(e);
      analytics.trackEvent('display', 'dhanguru-slide', e);
    }
  };

  const getGuruIndex = (index) => {
    if (index < 9) {
      return `0${index + 1}`;
    }
    return `${index + 1}`;
  };

  return (
    <div className={classNames('dhan-guru-pane', className, shortcutTray && 'misc-pane-shrinked')}>
      {gurus.map((guru, index) => (
        <div
          className="dhan-guru-button"
          key={guru}
          onClick={() => addDhanGuruSlide(insertSlide.slideStrings.dhanguruStrings[index])}
          onMouseEnter={() => {
            refsByGuruIndex[guru].current.classList.add('dhan-guru-button-prefix-hover');
            refsByGuruIndex[guru].current.innerHTML = '';
          }}
          onMouseLeave={() => {
            refsByGuruIndex[guru].current.classList.remove('dhan-guru-button-prefix-hover');
            refsByGuruIndex[guru].current.innerHTML = getGuruIndex(index);
          }}
        >
          <span className="dhan-guru-button-prefix" ref={refsByGuruIndex[guru]}>
            {getGuruIndex(index)}
          </span>
          <span className="dhan-guru-button-text">{i18n.t(`INSERT.DHAN_GURU.${guru}`)}</span>
        </div>
      ))}
    </div>
  );
};

DhanGuruPane.propTypes = {
  className: PropTypes.string,
};
