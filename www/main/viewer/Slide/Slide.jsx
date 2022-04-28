import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';

global.platform = require('../../desktop_scripts');

const Slide = ({ verseObj, nextLineObj, isMiscSlide }) => {
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
  const { activeVerseId } = useStoreState(state => state.navigator);
  const activeVerseRef = useRef(null);

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
    return { fontSize: `${verseType}vh` };
  };

  useEffect(() => {
    global.platform.ipc.send('cast-to-receiver');
  }, [verseObj, isMiscSlide]);

  useEffect(() => {
    setTimeout(() => {
      if (activeVerseRef && activeVerseRef.current.className.includes('active-viewer-verse')) {
        activeVerseRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 100);
  }, [verseObj]);

  return (
    <>
      <div className={`verse-slide ${leftAlign ? ' slide-left-align' : ''}`}>
        {isMiscSlide && <SlideAnnouncement getFontSize={getFontSize} isMiscSlide={isMiscSlide} />}
        {verseObj && !isMiscSlide && (
          <>
            {verseObj.Gurmukhi && (
              <h1
                className={`slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()} ${
                  activeVerseId === verseObj.ID ? 'active-viewer-verse' : ''
                }`}
                ref={activeVerseRef}
              >
                <SlideGurbani
                  getFontSize={getFontSize}
                  gurmukhiString={verseObj.Gurmukhi}
                  larivaar={larivaar}
                  vishraamPlacement={verseObj.Visraam ? JSON.parse(verseObj.Visraam) : {}}
                  vishraamSource={vishraamSource}
                />
              </h1>
            )}

            {translationVisibility && verseObj.Translations && (
              <SlideTranslation
                getFontSize={getFontSize}
                translationObj={JSON.parse(verseObj.Translations)}
              />
            )}

            {verseObj.English && (
              <SlideTranslation getFontSize={getFontSize} translationHTML={verseObj.English} />
            )}

            {teekaVisibility && verseObj.Translations && (
              <SlideTeeka getFontSize={getFontSize} teekaObj={JSON.parse(verseObj.Translations)} />
            )}
            {transliterationVisibility && (
              <SlideTransliteration getFontSize={getFontSize} gurmukhiString={verseObj.Gurmukhi} />
            )}
            {displayNextLine && nextLineObj && (
              <div
                className={`slide-next-line slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}
              >
                <SlideGurbani
                  getFontSize={getFontSize}
                  gurmukhiString={nextLineObj.Gurmukhi}
                  larivaar={larivaar}
                  vishraamPlacement={verseObj.Visraam ? JSON.parse(verseObj.Visraam) : {}}
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
  isMiscSlide: PropTypes.bool,
};

export default Slide;
