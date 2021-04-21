import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import SlideTeeka from './SlideTeeka';
import SlideGurbani from './SlideGurbani';
import SlideTranslation from './SlideTranslation';
import SlideTransliteration from './SlideTransliteration';

const Slide = ({ verseObj, themeStyleObj }) => {
  const {
    translationVisibility,
    transliterationVisibility,
    teekaVisibility,
    larivaar,
    vishraamSource,
  } = useStoreState(state => state.userSettings);

  return (
    <div className="verse-slide">
      <div className="slide-gurbani">
        <SlideGurbani
          gurmukhiString={verseObj.Gurmukhi}
          larivaar={larivaar}
          vishraamPlacement={JSON.parse(verseObj.Visraam)}
          vishraamSource={vishraamSource}
          gurbaniColor={themeStyleObj['gurbani-color']}
        />
      </div>
      {translationVisibility && <SlideTranslation />}
      {transliterationVisibility && <SlideTransliteration />}
      {teekaVisibility && <SlideTeeka />}
    </div>
  );
};

Slide.propTypes = {
  verseObj: PropTypes.object,
  themeStyleObj: PropTypes.object,
};

export default Slide;
