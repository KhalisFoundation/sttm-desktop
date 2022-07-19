import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';

const remote = require('@electron/remote');
const tingle = require('../../../../assets/js/vendor/tingle');

const { gurus } = insertSlide.dropdownStrings;
const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const InsertPane = ({ className }) => {
  const {
    isMiscSlide,
    isMiscSlideGurmukhi,
    miscSlideText,
    isAnnoucement,
    shortcuts,
  } = useStoreState(state => state.navigator);
  const {
    setIsMiscSlide,
    setIsMiscSlideGurmukhi,
    setMiscSlideText,
    setIsAnnoucement,
    setShortcuts,
  } = useStoreActions(state => state.navigator);

  const inputRef = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    addMiscSlide(insertSlide.slideStrings.waheguru);
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
    if (typeof e === 'object') {
      addMiscSlide(e.target.value);
      analytics.trackEvent('display', 'dhanguru-slide', e.target.value);
    } else {
      addMiscSlide(e);
      analytics.trackEvent('display', 'dhanguru-slide', e);
    }
  };

  let slidePage = `<h1 class = "modalTitle">${i18n.t('INSERT.INSERT_DHAN_SLIDE')}</h1>
  <div class="btn-group" id = "btn-group">`;
  gurus.forEach((guru, index) => {
    slidePage += `<button class="guru" id="guru${index}">${i18n.t(
      `INSERT.DHAN_GURU.${guru}`,
    )}</button>`;
  });
  slidePage += `</div>`;

  const showDhanGuruModal = () => {
    if (!isModalOpen) {
      const modal = new tingle.Modal({
        footer: true,
        stickyFooter: false,
        closeMethods: ['overlay', 'button', 'escape'],
        onClose() {
          modal.modal.classList.remove('tingle-modal--visible');
          setIsModalOpen(false);
          modal.destroy();
        },
        beforeClose() {
          return true; // close the modal
        },
      });
      if (!modal.isOpen()) {
        setIsModalOpen(true);
        const buttonOnClick = () => {
          gurus.forEach((guru, index) => {
            document.querySelector(`#guru${index}`).onclick = () => {
              addDhanGuruSlide(insertSlide.slideStrings.dhanguruStrings[index]);
              modal.close();
              setIsModalOpen(false);
              modal.destroy();
            };
          });
        };

        // sets the default page to Dhan Guru slide page
        modal.setContent(slidePage);
        buttonOnClick();
        modal.open();
      }
    }
  };

  useEffect(() => {
    if (shortcuts.openDhanGuruSlide) {
      showDhanGuruModal();
      setShortcuts({
        ...shortcuts,
        openDhanGuruSlide: false,
      });
    }
  }, [shortcuts]);

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
          <select onChange={addDhanGuruSlide}>
            <option value="" disabled>
              {i18n.t('INSERT.SELECT')}
            </option>
            {gurus.map((value, index) => (
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
