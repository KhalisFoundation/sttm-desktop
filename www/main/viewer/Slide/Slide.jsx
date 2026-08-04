import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import { CSSTransition } from 'react-transition-group';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';
import { shallowEqual } from '../../common/utils';

global.platform = require('../../desktop_scripts');

const Slide = React.memo(({ verseObj, nextLineObj, isMiscSlide, akhandpattView, updateVerseRef }) => {
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
    slideTransitions,
  } = useStoreState(
    // Subscribe to only the formatting fields this Slide renders from, compared
    // shallowly. Without this scoping the selector returns the whole
    // `userSettings` slice, so every mounted Slide re-renders on any change in
    // it, including the high-frequency Akhand Paatth scroll-speed and autoplay
    // ticks, which on a long Shabad (hundreds of Slides) froze the UI.
    (state) => ({
      larivaar: state.userSettings.larivaar,
      larivaarAssist: state.userSettings.larivaarAssist,
      larivaarAssistType: state.userSettings.larivaarAssistType,
      leftAlign: state.userSettings.leftAlign,
      vishraamSource: state.userSettings.vishraamSource,
      vishraamType: state.userSettings.vishraamType,
      displayNextLine: state.userSettings.displayNextLine,
      content1: state.userSettings.content1,
      content2: state.userSettings.content2,
      content3: state.userSettings.content3,
      content1Visibility: state.userSettings.content1Visibility,
      content2Visibility: state.userSettings.content2Visibility,
      content3Visibility: state.userSettings.content3Visibility,
      slideTransitions: state.userSettings.slideTransitions,
    }),
    shallowEqual,
  );

  const { activeVerseId } = useStoreState((state) => state.navigator);
  const [showVerse, setShowVerse] = useState(true);
  const [orderMarkup, setOrderMarkup] = useState(null);

  const activeVerseRef = useRef(null);

  const visibilityStates = [content1Visibility, content2Visibility, content3Visibility];

  const isOnlyGurbaniVisible = () => {
    const hasOrderMarkup = orderMarkup && orderMarkup.some((item) => item !== null);
    const hasEnglishTranslation = verseObj && verseObj.English;
    const hasNextLine = displayNextLine && nextLineObj;

    return !hasOrderMarkup && !hasEnglishTranslation && !hasNextLine;
  };

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
    if (akhandpattView) {
      setShowVerse(true);
      return;
    }
    setShowVerse(false);

    const timeoutId = setTimeout(() => {
      setShowVerse(true);
      global.platform.ipc.send('cast-to-receiver');
    }, 200);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timeoutId);
  }, [verseObj, isMiscSlide, akhandpattView]);

  useEffect(() => {
    if (akhandpattView) {
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      if (activeVerseRef && activeVerseRef.current?.className.includes('active-viewer-verse')) {
        activeVerseRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [verseObj, akhandpattView]);

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

  return isMiscSlide ? (
    <div className="verse-slide-wrapper">
      {isMiscSlide && <SlideAnnouncement getFontSize={getFontSize} isMiscSlide={isMiscSlide} />}
    </div>
  ) : (
    verseObj && (
      <div
        className={akhandpattView ? '' : 'verse-slide-wrapper'}
        id={`verse-${verseObj.ID}`}
        ref={(el) => {
          updateVerseRef(verseObj.ID, el);
        }}
        // Read back by the Akhand Paatth scroll engine; see
        // `viewer/akhandpatt/verse-elements` for what depends on it.
        data-verseid={verseObj.ID}
      >
        <CSSTransition
          in={showVerse}
          timeout={akhandpattView || !slideTransitions ? 0 : 300}
          classNames="fade"
          unmountOnExit={!akhandpattView}
        >
          <div
            className={`verse-slide ${leftAlign ? ' slide-left-align' : ''} ${
              isOnlyGurbaniVisible() ? ' only-gurbani' : ''
            }`}
          >
            {verseObj && showVerse && (
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
    )
  );
});

Slide.displayName = 'Slide';

Slide.propTypes = {
  verseObj: PropTypes.object,
  nextLineObj: PropTypes.object,
  isMiscSlide: PropTypes.bool,
  akhandpattView: PropTypes.bool,
  bgColor: PropTypes.string,
  updateVerseRef: PropTypes.func,
};

export default Slide;
