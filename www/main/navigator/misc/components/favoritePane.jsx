import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

export const FavoritePane = ({ className }) => {
  const {
    activeShabadId,
    initialVerseId,
    versesRead,
    isCeremonyBani,
    isSundarGutkaBani,
    homeVerse,
    activeVerseId,
    singleDisplayActiveTab,
    favShabad,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
    setHomeVerse,
    setActiveVerseId,
    setSingleDisplayActiveTab,
  } = useStoreActions((state) => state.navigator);

  const openShabadFromFav = (element) => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (element.shabadId !== activeShabadId) {
      setActiveShabadId(element.shabadId);

      if (element.verseId !== activeVerseId) {
        setActiveVerseId(element.verseId);
      }

      if (element.verseId !== initialVerseId) {
        setInitialVerseId(element.verseId);
      }

      if (element.verseId !== homeVerse) {
        setHomeVerse(element.verseId);
      }

      if (versesRead !== []) {
        setVersesRead([]);
      }

      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }

      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
    }
  };

  return (
    <div className={'history-results ' + className}>
      {favShabad.map((element, index) => {
        return (
          <p
            className="history-item gurmukhi"
            key={`favshabad-${index}`}
            onClick={() => {
              openShabadFromFav(element);
            }}
          >
            {element.text}
          </p>
        );
      })}
    </div>
  );
};

FavoritePane.propTypes = {
  className: PropTypes.string,
};
