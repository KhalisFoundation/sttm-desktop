export const udpateHistory = (
  currentShabadId,
  newTraversedVerse,
  { verseHistory, setPaneAttributes, paneAttributes },
) => {
  const existingShabadIndex = verseHistory.findIndex(
    (historyShabad) => historyShabad.shabadId === currentShabadId,
  );
  const currentHistoryObj = verseHistory[existingShabadIndex];
  if (currentHistoryObj) {
    currentHistoryObj.continueFrom = newTraversedVerse;
    if (!currentHistoryObj.versesRead.includes(newTraversedVerse)) {
      currentHistoryObj.versesRead = [...currentHistoryObj.versesRead, newTraversedVerse];
      setPaneAttributes({
        ...paneAttributes,
        activeVerse: newTraversedVerse,
        versesRead: currentHistoryObj.versesRead,
      });
    }
  }
};

export const changeVerse = (
  newTraversedVerse,
  verseIndex,
  clickedShabad,
  {
    activeVerseId,
    setActiveVerseId,
    setActiveVerse,
    setActiveShabadId,
    activeShabadId,
    setPreviousIndex,
  },
) => {
  if (clickedShabad !== activeShabadId) {
    setActiveShabadId(clickedShabad);
    setPreviousIndex(null);
  }
  setActiveVerse({ [verseIndex]: newTraversedVerse });
  if (activeVerseId !== newTraversedVerse) {
    setActiveVerseId(newTraversedVerse);
  }
};

export const sendToBaniController = (
  crossPlatformId,
  activeShabad,
  newTraversedVerse,
  baniLength,
  {
    isSundarGutkaBani,
    sundarGutkaBaniId,
    isCeremonyBani,
    ceremonyId,
    activeShabadId,
    paneAttributes,
  },
) => {
  if (window.socket !== undefined && window.socket !== null) {
    let baniVerse;
    if (!crossPlatformId) {
      baniVerse = activeShabad.find((obj) => obj.ID === newTraversedVerse);
    }
    if (isSundarGutkaBani) {
      window.socket.emit('data', {
        host: 'sttm-desktop',
        type: 'bani',
        id: sundarGutkaBaniId,
        shabadid: sundarGutkaBaniId, // @deprecated
        highlight: crossPlatformId || baniVerse.crossPlatformID,
        baniLength,
        // mangalPosition,
        verseChange: false,
      });
    } else if (isCeremonyBani) {
      window.socket.emit('data', {
        host: 'sttm-desktop',
        type: 'ceremony',
        id: ceremonyId,
        shabadid: ceremonyId, // @deprecated
        highlight: crossPlatformId || baniVerse.crossPlatformID,
        verseChange: false,
      });
    } else {
      window.socket.emit('data', {
        type: 'shabad',
        host: 'sttm-desktop',
        id: activeShabadId,
        shabadid: activeShabadId, // @deprecated
        highlight: newTraversedVerse,
        homeId: paneAttributes.homeVerse,
        verseChange: false,
      });
    }
  }
};

const skipIkOnkar = (shabadVerses, index) => {
  if (shabadVerses[index]) {
    // eslint-disable-next-line no-unsafe-optional-chaining
    const { verse: gurmukhi } = shabadVerses[index]?.verse;
    const { verseId } = shabadVerses[index];
    if (verseId !== 1 && /^(<>)/gm.test(gurmukhi)) {
      return index + 1;
    }
    return index;
  }
  return 0;
};

const skipMangla = (shabadVerses, index) => {
  const gurmukhi = shabadVerses[index]?.verse;
  if (/(mhlw [\w])|(mÚ [\w])/.test(gurmukhi) || (index === 0 && /sloku/.test(gurmukhi))) {
    return skipIkOnkar(shabadVerses, index + 1);
  }
  return skipIkOnkar(shabadVerses, index);
};

export const intelligentNextVerse = (
  filteredItems,
  { activeVerseId, previousVerseIndex, setPreviousIndex, atHome, setHome, homeVerse },
) => {
  if (homeVerse) {
    const currentVerseIndex = filteredItems.findIndex(({ verseId }) => verseId === activeVerseId);
    let nextVerseIndex;

    if (atHome) {
      if (previousVerseIndex !== null) {
        nextVerseIndex = previousVerseIndex + 1;
        if (nextVerseIndex >= filteredItems.length) {
          nextVerseIndex = 0;
        }
      } else {
        nextVerseIndex = 0;
      }
      nextVerseIndex = skipMangla(filteredItems, nextVerseIndex);
      if (nextVerseIndex === homeVerse) {
        nextVerseIndex++;
      }
      setPreviousIndex(nextVerseIndex);
      setHome(false);
    } else {
      nextVerseIndex = skipMangla(filteredItems, currentVerseIndex + 1);

      if (nextVerseIndex >= filteredItems.length) {
        nextVerseIndex = 0;
      }
      const currentVerseObj = filteredItems[currentVerseIndex];
      const nextVerseObj = filteredItems[nextVerseIndex];

      if (currentVerseObj.lineNo !== nextVerseObj.lineNo) {
        nextVerseIndex = homeVerse;
        setHome(true);
      } else {
        setPreviousIndex(nextVerseIndex);
      }
    }
    const nextVerseId = filteredItems[nextVerseIndex].verseId;
    return { verseId: nextVerseId, verseIndex: nextVerseIndex };
  }
  return null;
};
