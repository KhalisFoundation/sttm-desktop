import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const HistoryPane = ({ className }) => {
  const {
    verseHistory,
    activeShabadId,
    initialVerseId,
    versesRead,
    isCeremonyBani,
    isSundarGutkaBani,
    ceremonyId,
    sundarGutkaBaniId,
    homeVerse,
    activeVerseId,
    singleDisplayActiveTab,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
    setCeremonyId,
    setSundarGutkaBaniId,
    setHomeVerse,
    setActiveVerseId,
    setSingleDisplayActiveTab,
  } = useStoreActions((state) => state.navigator);
  const [order, setOrder] = useState('newest');

  const openShabadFromHistory = (element) => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (element.verseId !== initialVerseId) {
      setInitialVerseId(element.verseId);
    }
    if (element.homeVerse !== homeVerse) {
      setHomeVerse(element.homeVerse);
    }
    if (element.versesRead !== versesRead) {
      setVersesRead(element.versesRead);
    }
    if (element.type === 'shabad') {
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      if (element.shabadId !== activeShabadId) {
        setActiveShabadId(element.shabadId);
      }
    }
    if (element.type === 'ceremony') {
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (!isCeremonyBani) {
        setIsCeremonyBani(true);
      }
      if (ceremonyId !== element.shabadId) {
        setCeremonyId(element.shabadId);
      }
    }
    if (element.type === 'bani') {
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      if (!isSundarGutkaBani) {
        setIsSundarGutkaBani(true);
      }

      if (sundarGutkaBaniId !== element.shabadId) {
        setSundarGutkaBaniId(element.shabadId);
      }
    }
    if (element.continueFrom !== activeVerseId) {
      setActiveVerseId(element.continueFrom);
    }
  };

  const versesMarkup = [];

  verseHistory.forEach((element) => {
    versesMarkup.push(
      <p
        className="history-item gurmukhi"
        key={`history-${element.shabadId}`}
        onClick={() => {
          openShabadFromHistory(element);
        }}
      >
        {element.label}
      </p>,
    );
  });

  return (
    <div>
      <div className="history-order">
        <div className="history-order-select">
          <label>Sort by: </label>
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>
      <div className={`history-results ${className}`}>
        {order === 'newest' ? versesMarkup : versesMarkup.slice().reverse()}
      </div>
    </div>
  );
};

HistoryPane.propTypes = {
  className: PropTypes.string,
};
