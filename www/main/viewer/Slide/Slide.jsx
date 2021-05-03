import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';
import QuickTools from './QuickTools';

const Slide = ({ verseObj, themeStyleObj }) => {
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
      <QuickTools />
      <div
        className={`verse-slide theme-${themeStyleObj.key}${leftAlign ? ' slide-left-align' : ''}`}
      >
        <div className={`slide-gurbani ${getLarivaarAssistClass()} ${getVishraamType()}`}>
          <SlideGurbani
            gurmukhiString={verseObj.Gurmukhi}
            larivaar={larivaar}
            vishraamPlacement={JSON.parse(verseObj.Visraam)}
            vishraamSource={vishraamSource}
          />
        </div>
        {translationVisibility && <SlideTranslation translationObj={verseObj.Translations} />}
        {teekaVisibility && <SlideTeeka teekaObj={verseObj.Translations.pu} />}
        {transliterationVisibility && (
          <SlideTransliteration transliterationObj={verseObj.Gurmukhi} />
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
      </div>
    </>
  );
};

Slide.propTypes = {
  verseObj: PropTypes.object,
  themeStyleObj: PropTypes.object,
};

export default Slide;
