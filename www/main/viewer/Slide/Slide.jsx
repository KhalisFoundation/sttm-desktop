import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';

const Slide = ({
  verseObj,
  nextLineObj,
  isAnnouncementSlide,
  isMoolMantraSlide,
  isWaheguruSlide,
  isEmptySlide,
  isDhanGuruSlide,
}) => {
  const {
    translationVisibility,
    transliterationVisibility,
    teekaVisibility,
    larivaar,
    larivaarAssist,
    larivaarAssistType,
    leftAlign,
    vishraamSource,
    vishraamType,
    displayNextLine,
    isSingleDisplayMode,
  } = useStoreState(state => state.userSettings);

  const getLarivaarAssistClass = () => {
    return (
      larivaarAssist &&
      (larivaarAssistType === 'single-color'
        ? 'larivaar-assist-single-color'
        : 'larivaar-assist-multi-color')
    );
  };

  const getVishraamType = () => {
    return vishraamType === 'colored-words' ? 'vishraam-colored' : 'vishraam-gradient';
  };

  const getFontSize = verseType => {
    if (isSingleDisplayMode) {
      return { fontSize: `${verseType}vh` };
    }
    return { fontSize: `${verseType * 3}px` };
  };

  return (
    <>
      <div className={`verse-slide ${leftAlign ? ' slide-left-align' : ''}`}>
        {(isWaheguruSlide ||
          isAnnouncementSlide ||
          isEmptySlide ||
          isMoolMantraSlide ||
          isDhanGuruSlide) && (
          <SlideAnnouncement
            getFontSize={getFontSize}
            isWaheguruSlide={isWaheguruSlide}
            isMoolMantraSlide={isMoolMantraSlide}
            isEmptySlide={isEmptySlide}
            isDhanGuruSlide={isDhanGuruSlide}
          />
        )}
        {verseObj &&
          !isEmptySlide &&
          !isWaheguruSlide &&
          !isMoolMantraSlide &&
          !isDhanGuruSlide &&
          !isAnnouncementSlide && (
            <>
              <div className={`slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}>
                <SlideGurbani
                  getFontSize={getFontSize}
                  gurmukhiString={verseObj.Gurmukhi}
                  larivaar={larivaar}
                  vishraamPlacement={JSON.parse(verseObj.Visraam)}
                  vishraamSource={vishraamSource}
                />
              </div>
              {translationVisibility && (
                <SlideTranslation
                  getFontSize={getFontSize}
                  translationObj={JSON.parse(verseObj.Translations)}
                />
              )}
              {teekaVisibility && (
                <SlideTeeka
                  getFontSize={getFontSize}
                  teekaObj={JSON.parse(verseObj.Translations).pu}
                />
              )}
              {transliterationVisibility && (
                <SlideTransliteration
                  getFontSize={getFontSize}
                  gurmukhiString={verseObj.Gurmukhi}
                />
              )}
              {displayNextLine && nextLineObj.Gurmukhi && nextLineObj.Visraam && (
                <div
                  className={`slide-next-line slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}
                >
                  <SlideGurbani
                    getFontSize={getFontSize}
                    gurmukhiString={nextLineObj.Gurmukhi}
                    larivaar={larivaar}
                    vishraamPlacement={JSON.parse(verseObj.Visraam)}
                    vishraamSource={vishraamSource}
                  />
                </div>
              )}
            </>
          )}
      </div>
    </>
  );
};

Slide.propTypes = {
  verseObj: PropTypes.object,
  nextLineObj: PropTypes.object,
  isAnnouncementSlide: PropTypes.bool,
  isMoolMantraSlide: PropTypes.bool,
  isWaheguruSlide: PropTypes.bool,
  isEmptySlide: PropTypes.bool,
  isDhanGuruSlide: PropTypes.bool,
};

export default Slide;
