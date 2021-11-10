import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';

export const InsertPane = ({ className }) => {
  const { isMiscSlide, isMiscSlideGurmukhi, miscSlideText, isAnnoucement } = useStoreState(
    state => state.navigator,
  );
  const {
    setIsMiscSlide,
    setIsMiscSlideGurmukhi,
    setMiscSlideText,
    setIsAnnoucement,
  } = useStoreActions(state => state.navigator);

  const { i18n } = remote.require('./app');
  const inputRef = useRef(null);
  const gurus = insertSlide.dropdownStrings;
  const analytics = remote.getGlobal('analytics');

  const addMiscSlide = givenText => {
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

  const openWaheguruSlide = () => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    addMiscSlide('vwihgurU');
  };

  const openBlankViewer = () => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    addMiscSlide('');
  };

  const toggleAnnouncementLanguage = event => {
    if (isMiscSlideGurmukhi !== event.target.checked) {
      setIsMiscSlideGurmukhi(event.target.checked);
    }
  };

  const addDhanGuruSlide = e => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    addMiscSlide(e.target.value);
  };

  return (
    <ul className={`list-of-items ${className}`}>
      <li>
        <a onClick={() => openBlankViewer()}>
          <i className="fa fa-eye-slash list-icon" />
          {i18n.t('INSERT.ADD_EMPTY_SLIDE')}
        </a>
      </li>
      <li>
        <a onClick={() => openWaheguruSlide()}>
          <i className="fa fa-circle list-icon" />
          {i18n.t('INSERT.ADD_WAHEGURU_SLIDE')}
        </a>
      </li>
      <li>
        <a>
          <i className="fa fa-circle-o list-icon" />
          <label>{i18n.t('INSERT.ADD_DHAN_GURU')} </label>
          <select onClick={addDhanGuruSlide}>
            <option value="" disabled>
              {i18n.t('INSERT.SELECT')}
            </option>
            {gurus.gurus.map((value, index) => (
              <option value={insertSlide.slideStrings.dhanguruStrings[index]} key={index}>
                {i18n.t(`INSERT.DHAN_GURU.${value}`)}
              </option>
            ))}
          </select>
        </a>
      </li>
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
