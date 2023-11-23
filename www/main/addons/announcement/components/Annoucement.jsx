import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ipcRenderer } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { classNames } from '../../../common/utils';
import { IconButton } from '../../../common/sttm-ui';
import { GurmukhiKeyboard } from '../../../navigator/search/components/GurmukhiKeyboard';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const Announcement = ({ isGurmukhi }) => {
  const { isMiscSlide, isMiscSlideGurmukhi, miscSlideText, isAnnoucement } = useStoreState(
    (state) => state.navigator,
  );
  const { setIsMiscSlide, setMiscSlideText, setIsAnnoucement, setIsMiscSlideGurmukhi } =
    useStoreActions((state) => state.navigator);

  const [announcementVal, setAnnouncementVal] = useState('');
  const inputRef = useRef(null);

  // Gurmukhi Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);

  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);

    analytics.trackEvent('display', 'announcement-slide', 'announcement-in-gurmukhi', isGurmukhi);
  };

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
    if (isGurmukhi !== isMiscSlideGurmukhi) {
      setIsMiscSlideGurmukhi(isGurmukhi);
    }
    if (!isAnnoucement) {
      setIsAnnoucement(true);
    }
    analytics.trackEvent(
      'display',
      'announcement-slide',
      'announcement-content',
      inputRef.current.value,
    );
  };

  const handleChange = (event) => {
    setAnnouncementVal(event.target.value);
  };

  const getPlaceholderText = (gurmukhiPlaceholder) => {
    if (gurmukhiPlaceholder) {
      return i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT_GURMUKHI');
    }
    return i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT');
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
    <div className="announcement-body">
      <div className="textarea-container">
        <textarea
          className={classNames(
            'announcement-text',
            keyboardOpenStatus && 'gurmukhi',
            isGurmukhi && 'gurmukhi',
            'disable-kb-shortcuts',
          )}
          placeholder={getPlaceholderText(isGurmukhi)}
          ref={inputRef}
          value={announcementVal}
          onChange={handleChange}
        />
        {isGurmukhi && (
          <IconButton
            className="keyboard-toggle"
            icon="fa fa-keyboard-o"
            onClick={HandleKeyboardToggle}
          />
        )}
      </div>
      {keyboardOpenStatus && isGurmukhi && (
        <GurmukhiKeyboard
          title={i18n.t('INSERT.GURMUKHI_KEYBOARD')}
          searchType={2}
          query={announcementVal}
          setQuery={setAnnouncementVal}
        />
      )}
      <div className="announcement-actions">
        <button className="announcement-slide-btn" onClick={addAnnouncement}>
          {i18n.t('INSERT.ADD_ANNOUNCEMENT')}
        </button>
      </div>
    </div>
  );
};

Announcement.propTypes = {
  isGurmukhi: PropTypes.bool,
};

export default Announcement;
