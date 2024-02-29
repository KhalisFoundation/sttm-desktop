import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
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
  } = useStoreState((state) => state.userSettings);

  const { activeVerseId, baniOrder } = useStoreState((state) => state.navigator);
  const [showVerse, setShowVerse] = useState(true);
  const [orderMarkup, setOrderMarkup] = useState(null);

  const activeVerseRef = useRef(null);

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
  }, [verseObj]);

  useEffect(() => {
    const markup = baniOrder.map((orderObj, index) => {
      switch (orderObj.label) {
        case 'teeka':
          return (
            verseObj &&
            verseObj.Translations && (
              <SlideTeeka
                getFontSize={getFontSize}
                teekaObj={JSON.parse(verseObj.Translations)}
                key={`line-${index}`}
              />
            )
          );
        case 'translation':
          return (
            verseObj &&
            verseObj.Translations && (
              <SlideTranslation
                getFontSize={getFontSize}
                translationObj={JSON.parse(verseObj.Translations)}
                key={`line-${index}`}
                lang={orderObj.id}
              />
            )
          );
        case 'transliteration':
          return (
            verseObj &&
            verseObj.Gurmukhi && (
              <SlideTransliteration
                getFontSize={getFontSize}
                gurmukhiString={verseObj.Gurmukhi}
                key={`line-${index}`}
                lang={orderObj.id}
              />
            )
          );
        default:
          return null;
      }
    });
    setOrderMarkup(markup);
  }, [baniOrder]);

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
                    'font-weight': 'normal', // adding style here to reach chromecast
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
