import React, { useRef } from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';

export const InsertPane = () => {
  const {
    announcementString,
    isAnnouncementSlide,
    announcementGurmukhi,
    isEmptySlide,
    isWaheguruSlide,
    isMoolMantraSlide,
    isDhanGuruSlide,
    dhanGuruString,
  } = useStoreState(state => state.navigator);
  const {
    setAnnouncementString,
    setIsAnnouncementSlide,
    setAnnouncementGurmukhi,
    setIsEmptySlide,
    setIsWaheguruSlide,
    setIsMoolMantraSlide,
    setIsDhanGuruSlide,
    setDhanGuruString,
  } = useStoreActions(state => state.navigator);

  const { i18n } = remote.require('./app');
  const inputRef = useRef(null);
  const gurus = insertSlide.dropdownStrings;

  const addAnnouncement = () => {
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isDhanGuruSlide) {
      setIsDhanGuruSlide(false);
    }
    if (!isAnnouncementSlide) {
      setIsAnnouncementSlide(true);
    }
    if (announcementString !== inputRef.current.value) {
      setAnnouncementString(inputRef.current.value);
    }
  };

  const openWaheguruSlide = () => {
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isDhanGuruSlide) {
      setIsDhanGuruSlide(false);
    }
    if (!isWaheguruSlide) {
      setIsWaheguruSlide(true);
    }
  };

  const openBlankViewer = () => {
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isDhanGuruSlide) {
      setIsDhanGuruSlide(false);
    }
    if (!isEmptySlide) {
      setIsEmptySlide(true);
    }
  };

  const toggleAnnouncementLanguage = event => {
    setAnnouncementGurmukhi(event.target.checked);
  };

  const addDhanGuruSlide = e => {
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (!isDhanGuruSlide) {
      setIsDhanGuruSlide(true);
    }
    if (dhanGuruString !== e.target.value) {
      setDhanGuruString(e.target.value);
    }
  };

  return (
    <ul className="list-of-items">
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
          className={`${announcementGurmukhi ? 'gurmukhi' : ''} announcement-text`}
          placeholder={
            !announcementGurmukhi
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
