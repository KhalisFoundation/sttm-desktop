import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import anvaad from 'anvaad-js';
import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';
import bakePanktee from '../hooks/bakePanktee';

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
  const usebakePanktee = bakePanktee();

  const getLarivaarAssistClass = () => {
    if (larivaarAssist) {
      return larivaarAssistType === 'single-color'
        ? 'larivaar-assist-single-color'
        : 'larivaar-assist-multi-color';
    }
    return '';
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

  useEffect(() => {
    const obj = {};
    const translations = JSON.parse(verseObj.Translations);
    const teeka = JSON.parse(verseObj.Translations).pu;

    obj.gurmukhi = usebakePanktee(
      getFontSize,
      verseObj.Gurmukhi,
      isWaheguruSlide,
      JSON.parse(verseObj.Visraam),
      vishraamSource,
    );
    obj.larivaar = usebakePanktee(
      getFontSize,
      verseObj.Gurmukhi,
      isWaheguruSlide,
      JSON.parse(verseObj.Visraam),
      vishraamSource,
    );
    obj.nextLineObj = usebakePanktee(
      getFontSize,
      nextLineObj.Gurmukhi,
      isWaheguruSlide,
      JSON.parse(verseObj.Visraam),
      vishraamSource,
    );
    obj.translation = {
      English: translations.en.bdb,
      Spanish: translations.es.sn,
      Hindi: translations.hi && translations.hi.ss,
    };
    obj.transliteration = {
      Devanagari: anvaad.translit(verseObj.Gurmukhi || '', 'devnagri'),
      English: anvaad.translit(verseObj.Gurmukhi),
      Shahmukhi: anvaad.translit(verseObj.Gurmukhi || '', 'shahmukhi'),
    };
    obj.teeka = teeka.bdb || teeka.ss;
  }, []);

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
