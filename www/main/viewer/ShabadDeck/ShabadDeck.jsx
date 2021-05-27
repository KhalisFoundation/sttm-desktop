import React, { useState, useEffect } from 'react';
import { useStoreState } from 'easy-peasy';
import Slide from '../Slide/Slide';
import { loadVerse } from '../../navigator/utils';

const themes = require('../../../../www/configs/themes.json');

function ShabadDeck() {
  const { setActiveShabadId, activeVerseId, isEmptySlide, isWaheguruSlide } = useStoreState(
    state => state.navigator,
  );
  const { theme: currentTheme } = useStoreState(state => state.userSettings);
  const [activeVerse, setActiveVerse] = useState(null);

  const getCurrentThemeInstance = () => {
    return themes.find(theme => theme.key === currentTheme);
  };

  const bakeThemeStyles = themeInstance => {
    return themeInstance['background-image-full']
      ? {
          backgroundImage: `url('assets/img/custom_backgrounds/${
            themeInstance['background-image-full']
          }')`,
        }
      : {
          backgroundColor: themeInstance['background-color'],
        };
  };

  const applyTheme = () => {
    const themeInstance = getCurrentThemeInstance();
    return bakeThemeStyles(themeInstance);
  };

  useEffect(() => {
    if (activeVerseId && !isEmptySlide && !isWaheguruSlide) {
      loadVerse(setActiveShabadId, activeVerseId).then(result =>
        result.map(activeRes => setActiveVerse(activeRes)),
      );
    }
    if (isEmptySlide && !isWaheguruSlide) {
      setActiveVerse(null);
    }
    if (isWaheguruSlide) {
      setActiveVerse({
        Gurmukhi: 'vwihgurU',
      });
    }
  }, [isWaheguruSlide, activeVerseId, isEmptySlide]);

  return (
    <div className="shabad-deck" style={applyTheme()}>
      <Slide
        verseObj={activeVerse}
        isWaheguruSlide={isWaheguruSlide}
        isEmptySlide={isEmptySlide}
        themeStyleObj={getCurrentThemeInstance()}
      />
    </div>
  );
}

export default ShabadDeck;
