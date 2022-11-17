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
    setFavShabad,
  } = useStoreActions((state) => state.navigator);

  const deleteFromFav = (inputElement) => {
    const favShabadIndex = favShabad.findIndex(
      (element) => element.shabadId === inputElement.shabadId,
    );

    if (favShabadIndex >= 0) {
      favShabad.splice(favShabadIndex, 1);
      setFavShabad([...favShabad]);
    }
  };

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
        const dateString = element.timestamp.toLocaleDateString('en-us', {
          day: 'numeric',
          year: 'numeric',
          month: 'short',
        });
        const timeString = element.timestamp.toLocaleTimeString('en-us', {
          hour: 'numeric',
          minute: 'numeric',
        });
        return (
          <div className="fav-shabad-container">
            <div className="fav-shabad-text">
              <p
                className="fav-item gurmukhi"
                key={`favshabad-${index}`}
                onClick={() => {
                  openShabadFromFav(element);
                }}
              >
                {element.text}
              </p>
            </div>
            <div className="fav-shabad-options">
              <p className="date">{dateString}</p>
              <p className="time">{timeString}</p>
              <button
                onClick={() => {
                  deleteFromFav(element);
                }}
              >
                <i class="fa-solid fa-x"></i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

FavoritePane.propTypes = {
  className: PropTypes.string,
};
