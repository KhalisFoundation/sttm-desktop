import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { CSSTransition } from 'react-transition-group';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';

global.platform = require('../../desktop_scripts');

const Slide = ({ verseObj, nextLineObj, isMiscSlide, bgColor }) => {
  const {
    larivaar,
    larivaarAssist,
    larivaarAssistType,
    leftAlign,
    vishraamSource,
    vishraamType,
    displayNextLine,
    content1,
    content2,
    content3,
    content1Visibility,
    content2Visibility,
    content3Visibility,
  } = useStoreState((state) => state.userSettings);

  const { activeVerseId, disabledContent } = useStoreState((state) => state.navigator);
  const { setDisabledContent } = useStoreActions((state) => state.navigator);
  const [showVerse, setShowVerse] = useState(true);
  const [orderMarkup, setOrderMarkup] = useState(null);

  const activeVerseRef = useRef(null);

  const visibilityStates = [content1Visibility, content2Visibility, content3Visibility];

  const getLarivaarAssistClass = () => {
    if (larivaarAssist) {
      return larivaarAssistType === 'single-color'
        ? 'larivaar-assist-single-color'
        : 'larivaar-assist-multi-color';
    }
    return '';
  };
  const getVishraamType = () =>
    vishraamType === 'colored-words' ? 'vishraam-colored' : 'vishraam-gradient';

  const getFontSize = (verseType) => ({ fontSize: `${verseType}vh` });

  useEffect(() => {
    setShowVerse(false);

    const timeoutId = setTimeout(() => {
      setShowVerse(true);
      global.platform.ipc.send('cast-to-receiver');
    }, 200);

    return () => clearTimeout(timeoutId);
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
    if (verseObj && verseObj.Translations) {
      const translations = JSON.parse(verseObj.Translations);

      const translationMapping = {
        'en.bdb': 'translation-english',
        'es.sn': 'translation-spanish',
        'hi.ss': 'translation-hindi',
      };

      const missingTranslations = Object.entries(translationMapping)
        .filter(([key]) => {
          const value = key.split('.').reduce((obj, k) => obj && obj[k], translations);
          return !value || !value.trim();
        })
        // eslint-disable-next-line no-unused-vars
        .map(([_, identifier]) => identifier);

      if (JSON.stringify(disabledContent) !== JSON.stringify(missingTranslations)) {
        setDisabledContent(missingTranslations);
      }
    }
  }, [verseObj]);

  useEffect(() => {
    const markup = [content1, content2, content3].map((content, index) => {
      if (visibilityStates[index]) {
        if (content.includes('teeka')) {
          return (
            verseObj &&
            verseObj.Translations && (
              <SlideTeeka
                getFontSize={getFontSize}
                teekaObj={JSON.parse(verseObj.Translations)}
                key={`line-${index}`}
                position={index}
              />
            )
          );
        }
        if (content.includes('translation')) {
          return (
            verseObj &&
            verseObj.Translations && (
              <SlideTranslation
                getFontSize={getFontSize}
                translationObj={JSON.parse(verseObj.Translations)}
                key={`line-${index}`}
                lang={content}
                position={index}
              />
            )
          );
        }
        if (content.includes('transliteration')) {
          return (
            verseObj &&
            verseObj.Gurmukhi && (
              <SlideTransliteration
                getFontSize={getFontSize}
                gurmukhiString={verseObj.Gurmukhi}
                key={`line-${index}`}
                lang={content}
                position={index}
              />
            )
          );
        }
      }
      return null;
    });
    setOrderMarkup(markup);
  }, [
    content1,
    content2,
    content3,
    content1Visibility,
    content2Visibility,
    content3Visibility,
    verseObj,
  ]);

  return (
    <div className="verse-slide-wrapper" style={{ background: bgColor }}>
      <CSSTransition in={showVerse} timeout={300} classNames="fade" unmountOnExit>
        <div className={`verse-slide ${leftAlign ? ' slide-left-align' : ''}`}>
          {isMiscSlide && <SlideAnnouncement getFontSize={getFontSize} isMiscSlide={isMiscSlide} />}
          {verseObj && showVerse && !isMiscSlide && (
            <>
              {verseObj.Gurmukhi && (
                <h1
                  className={`slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()} ${
                    activeVerseId === verseObj.ID ? 'active-viewer-verse' : ''
                  }`}
                  ref={activeVerseRef}
                  style={{
                    fontWeight: 'normal', // adding style here to reach chromecast
                  }}
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

              {orderMarkup !== null && orderMarkup}

              {verseObj.English && (
                <SlideTranslation getFontSize={getFontSize} translationHTML={verseObj.English} />
              )}

              {displayNextLine && nextLineObj && (
                <div
                  className={`slide-next-line slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}
                >
                  <SlideGurbani
                    getFontSize={getFontSize}
                    gurmukhiString={nextLineObj.Gurmukhi}
                    larivaar={larivaar}
                    vishraamPlacement={nextLineObj.Visraam ? JSON.parse(nextLineObj.Visraam) : {}}
                    vishraamSource={vishraamSource}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </CSSTransition>
    </div>
  );
};

Slide.propTypes = {
  verseObj: PropTypes.object,
  nextLineObj: PropTypes.object,
  isMiscSlide: PropTypes.bool,
  bgColor: PropTypes.string,
};

export default Slide;
