import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';
import insertSlide from '../../../common/constants/slidedb';
import tingle from '../../../../assets/js/vendor/tingle';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');
const { gurus } = insertSlide.dropdownStrings;

export const DhanGuru = ({ isGurmukhi }) => {
  const { isMiscSlide, miscSlideText, isAnnoucement, isMiscSlideGurmukhi, shortcuts } =
    useStoreState((state) => state.navigator);
  const {
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnoucement,
    setShortcuts,
    setIsMiscSlideGurmukhi,
  } = useStoreActions((state) => state.navigator);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDhanGuruIndex, setCurrentDhanGuruIndex] = useState(null);

  const addMiscSlide = (givenText) => {
    if (!isMiscSlide) {
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const addDhanGuruSlide = (e) => {
    if (!isAnnoucement) {
      setIsAnnoucement(true);
    }
    if (typeof e === 'object') {
      addMiscSlide(e.target.value);
      analytics.trackEvent({
        category: 'display',
        action: 'dhanguru-slide',
        label: 'Dhan guru slide',
        value: e.target.value,
      });
    } else {
      addMiscSlide(e);
      analytics.trackEvent({
        category: 'display',
        action: 'dhanguru-slide',
        label: 'Dhan guru slide',
        value: e,
      });
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
              addDhanGuruSlide(
                insertSlide.slideStrings.dhanguruStrings[index][
                  isMiscSlideGurmukhi ? 'gurmukhi' : 'english'
                ],
              );
              setCurrentDhanGuruIndex(index);
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

  const getGuruIndex = (index) => {
    if (index < 9) {
      return `0${index + 1}`;
    }
    return `${index + 1}`;
  };

  const insertDhanGuru = (index) => {
    const { english, gurmukhi } = insertSlide.slideStrings.dhanguruStrings[index];
    setCurrentDhanGuruIndex(index);
    if (isGurmukhi !== isMiscSlideGurmukhi) {
      setIsMiscSlideGurmukhi(isGurmukhi);
    }
    if (isGurmukhi) {
      addDhanGuruSlide(gurmukhi);
    } else {
      addDhanGuruSlide(english);
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
    <>
      <header className="sync-header">
        <h3>{i18n.t('INSERT.ADD_DHAN_GURU')}</h3>
      </header>
      <div className="dhan-guru-pane">
        {gurus.map((guru, index) => (
          <div
            className="dhan-guru-button"
            key={guru}
            onClick={() => {
              insertDhanGuru(index);
            }}
          >
            <span className="dhan-guru-button-prefix">{getGuruIndex(index)}</span>
            {isGurmukhi ? (
              <span className="dhan-guru-button-text gurmukhi">
                {insertSlide.slideStrings.dhanguruStrings[index].gurmukhi}
              </span>
            ) : (
              <span className="dhan-guru-button-text">{i18n.t(`INSERT.DHAN_GURU.${guru}`)}</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

DhanGuru.propTypes = {
  isGurmukhi: PropTypes.bool,
};
