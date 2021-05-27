import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';
import QuickTools from './QuickTools';

const Slide = ({
  verseObj,
  isAnnouncementSlide,
  isMoolMantraSlide,
  isWaheguruSlide,
  isEmptySlide,
  themeStyleObj,
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

  return (
    <>
      <QuickTools
        isAnnouncementSlide={isAnnouncementSlide}
        isWaheguruSlide={isWaheguruSlide}
        isMoolMantraSlide={isMoolMantraSlide}
      />
      <div
        className={`verse-slide theme-${themeStyleObj.key}${leftAlign ? ' slide-left-align' : ''}`}
      >
        {(isWaheguruSlide || isAnnouncementSlide || isEmptySlide || isMoolMantraSlide) && (
          <SlideAnnouncement
            isWaheguruSlide={isWaheguruSlide}
            isMoolMantraSlide={isMoolMantraSlide}
            isEmptySlide={isEmptySlide}
          />
        )}
        {verseObj &&
          !isEmptySlide &&
          !isWaheguruSlide &&
          !isMoolMantraSlide &&
          !isAnnouncementSlide && (
            <>
              <div className={`slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}>
                <SlideGurbani
                  gurmukhiString={verseObj.Gurmukhi}
                  larivaar={larivaar}
                  vishraamPlacement={JSON.parse(verseObj.Visraam)}
                  vishraamSource={vishraamSource}
                />
              </div>
              {translationVisibility && (
                <SlideTranslation translationObj={JSON.parse(verseObj.Translations)} />
              )}
              {teekaVisibility && <SlideTeeka teekaObj={JSON.parse(verseObj.Translations).pu} />}
              {transliterationVisibility && (
                <SlideTransliteration gurmukhiString={verseObj.Gurmukhi} />
              )}
              {displayNextLine && (
                <div
                  className={`slide-next-line slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}
                >
                  <SlideGurbani
                    gurmukhiString={verseObj.Gurmukhi}
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
  isAnnouncementSlide: PropTypes.bool,
  isMoolMantraSlide: PropTypes.bool,
  isWaheguruSlide: PropTypes.bool,
  isEmptySlide: PropTypes.bool,
  themeStyleObj: PropTypes.object,
};

export default Slide;
