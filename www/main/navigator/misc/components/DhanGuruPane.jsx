import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';
import { classNames } from '../../../common/utils';
import tingle from '../../../../assets/js/vendor/tingle';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');
const { gurus } = insertSlide.dropdownStrings;

export const DhanGuruPane = ({ className }) => {
  const { isMiscSlide, miscSlideText, isAnnoucement, shortcuts } = useStoreState(
    (state) => state.navigator,
  );
  const { setIsMiscSlide, setMiscSlideText, setIsAnnoucement, setShortcuts } = useStoreActions(
    (state) => state.navigator,
  );
  const { shortcutTray } = useStoreState((state) => state.userSettings);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
