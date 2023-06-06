import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ipcRenderer } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const InsertPane = ({ className }) => {
  const { isMiscSlide, isMiscSlideGurmukhi, miscSlideText, isAnnoucement } = useStoreState(
    (state) => state.navigator,
  );
  const { setIsMiscSlide, setIsMiscSlideGurmukhi, setMiscSlideText, setIsAnnoucement } =
    useStoreActions((state) => state.navigator);

  const inputRef = useRef(null);

  const addMiscSlide = (givenText) => {
    if (!isMiscSlide) {
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const addAnnouncement = () => {
    addMiscSlide(inputRef.current.value);
    if (!isAnnoucement) {
      setIsAnnoucement(true);
    }
    analytics.trackEvent('display', 'announcement-slide');
  };

  const toggleAnnouncementLanguage = (event) => {
    if (isMiscSlideGurmukhi !== event.target.checked) {
      setIsMiscSlideGurmukhi(event.target.checked);
    }
  };

  useEffect(() => {
    if (isMiscSlide) {
      ipcRenderer.send('show-misc-text', {
        text: miscSlideText,
        isGurmukhi: isMiscSlideGurmukhi,
        isAnnoucement,
      });
    }
  }, [miscSlideText, isMiscSlide, isMiscSlideGurmukhi, isAnnoucement]);

  return (
    <ul className={`list-of-items ${className}`}>
      <li className="announcement-box">
        <header>
          <i className="fa fa-bullhorn list-icon" />
          {i18n.t('INSERT.ADD_ANNOUNCEMENT_SLIDE')}
        </header>
        <div className="announcement-switch">
          <span>{i18n.t('INSERT.ANNOUNCEMENT_IN_GURMUKHI')}</span>
          <div className="switch">
            <input
              id="announcement-language"
              name="announcement-language"
              type="checkbox"
              onChange={toggleAnnouncementLanguage}
            />
            <label htmlFor="announcement-language" />
          </div>
        </div>
        <textarea
          className={`${isMiscSlideGurmukhi ? 'gurmukhi' : ''} announcement-text`}
          placeholder={
            !isMiscSlideGurmukhi
              ? i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT')
              : i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT_GURMUKHI')
          }
          ref={inputRef}
        />
        <button className="announcement-slide-btn" onClick={addAnnouncement}>
          {i18n.t('INSERT.ADD_ANNOUNCEMENT')}
        </button>
      </li>
    </ul>
  );
};

InsertPane.propTypes = {
  className: PropTypes.string,
};
