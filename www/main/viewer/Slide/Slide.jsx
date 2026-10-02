import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import { CSSTransition } from 'react-transition-group';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import SlideAnnouncement from './SlideAnnouncement';

const aiTranslationDB = require('../../banidb/pss-db');

global.platform = require('../../desktop_scripts');

/**
 * Parse translations JSON and, when the selected English source is served by
 * the AI translations database, inject that source's text under its own key
 * (e.g. translations.en.pss) so SlideTranslation can read it as usual.
 */
const getTranslationsWithPSS = (verseObj, source) => {
  const translations = JSON.parse(verseObj.Translations);
  if (!aiTranslationDB.isAiSource(source)) {
    return translations;
  }

  const translationText = aiTranslationDB.getTranslation(verseObj.ID, source);
  if (translationText) {
    if (!translations.en) {
      translations.en = {};
    }
    translations.en[source] = translationText;
  }
  return translations;
};

const Slide = React.memo(({ verseObj, nextLineObj, isMiscSlide, updateVerseRef }) => {
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
    akhandpatt,
    slideTransitions,
    translationEnglishSource,
  } = useStoreState((state) => state.userSettings);

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
    if (akhandpatt) {
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
  }, [verseObj, isMiscSlide, akhandpatt]);

  useEffect(() => {
    setTimeout(() => {
      if (activeVerseRef && activeVerseRef.current?.className.includes('active-viewer-verse')) {
        activeVerseRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 100);
  }, [verseObj, akhandpatt]);

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
                translationObj={getTranslationsWithPSS(verseObj, translationEnglishSource)}
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
    // the AI sources are injected per source, so the markup has to be rebuilt
    // when the selection changes and not only when the verse does
    translationEnglishSource,
  ]);

  return isMiscSlide ? (
    <div className="verse-slide-wrapper">
      {isMiscSlide && <SlideAnnouncement getFontSize={getFontSize} isMiscSlide={isMiscSlide} />}
    </div>
  ) : (
    verseObj && (
      <div
        className={akhandpatt ? '' : 'verse-slide-wrapper'}
        id={`verse-${verseObj.ID}`}
        ref={(el) => {
          updateVerseRef(verseObj.ID, el);
        }}
        data-verseid={verseObj.ID}
      >
        <CSSTransition
          in={showVerse}
          timeout={akhandpatt || !slideTransitions ? 0 : 300}
          classNames="fade"
          unmountOnExit={!akhandpatt}
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
  bgColor: PropTypes.string,
  updateVerseRef: PropTypes.func,
};

export default Slide;
