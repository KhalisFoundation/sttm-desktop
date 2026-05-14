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
    baniType,
    sundarGutkaBaniId,
    setSundarGutkaBaniId,
    ceremonyId,
    setCeremonyId,
    isSundarGutkaBani,
    setIsSundarGutkaBani,
    isCeremonyBani,
    setIsCeremonyBani,
  },
) => {
  switch (baniType) {
    case 'bani':
      if (clickedShabad !== sundarGutkaBaniId) {
        setSundarGutkaBaniId(clickedShabad);
        setPreviousIndex(null);
      }
      if (!isSundarGutkaBani) {
        setIsSundarGutkaBani(true);
      }
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      break;
    case 'ceremony':
      if (clickedShabad !== ceremonyId) {
        setCeremonyId(clickedShabad);
        setPreviousIndex(null);
      }

      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (!isCeremonyBani) {
        setIsCeremonyBani(true);
      }
      break;
    case 'shabad':
      if (clickedShabad !== activeShabadId) {
        setActiveShabadId(clickedShabad);
        setPreviousIndex(null);
      }
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      break;
    default:
      break;
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
    // Resolve a highlight value safely. `crossPlatformId` may be:
    //   - a real Realm crossPlatformID (best — desktop↔desktop sync)
    //   - '' (empty string) for Custom ceremony rows that have no Realm
    //     crossPlatformID column
    //   - undefined / null (caller didn't pass one)
    // When it's missing, look up the matching row in `activeShabad` by
    // `verseId`. The closure-captured `activeShabad` may still be empty
    // during the initial setVerseList → updateTraversedVerse call, so
    // guard the `.find` result before reading `.crossPlatformId`. As a
    // final fallback, ship the BaniDB-global `newTraversedVerse` as
    // `highlight` — web prefers the explicit `verseId` field anyway.
    let resolvedHighlight = crossPlatformId;
    if (!resolvedHighlight) {
      const matched = Array.isArray(activeShabad)
        ? activeShabad.find((obj) => obj && obj.verseId === newTraversedVerse)
        : null;
      resolvedHighlight = (matched && matched.crossPlatformId) || newTraversedVerse;
    }

    if (isSundarGutkaBani && sundarGutkaBaniId) {
      window.socket.emit('data', {
        host: 'sttm-desktop',
        type: 'bani',
        id: paneAttributes.activeShabad,
        shabadid: paneAttributes.activeShabad, // @deprecated
        // `highlight` carries the Realm crossPlatformId (desktop ↔ desktop
        // convention). `verseId` is the BaniDB-global verseId so the web
        // client — which has no crossPlatformId column on its rows — can
        // actually match the highlighted verse against its loaded list.
        highlight: resolvedHighlight,
        verseId: newTraversedVerse,
        baniLength,
        // mangalPosition,
        verseChange: false,
      });
    } else if (isCeremonyBani && ceremonyId) {
      window.socket.emit('data', {
        host: 'sttm-desktop',
        type: 'ceremony',
        id: paneAttributes.activeShabad,
        shabadid: paneAttributes.activeShabad, // @deprecated
        highlight: resolvedHighlight,
        verseId: newTraversedVerse,
        verseChange: false,
      });
    } else if (activeShabadId) {
      window.socket.emit('data', {
        type: 'shabad',
        host: 'sttm-desktop',
        id: paneAttributes.activeShabad,
        shabadid: paneAttributes.activeShabad, // @deprecated
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
  {
    activeVerseId,
    previousVerseIndex,
    setPreviousIndex,
    atHome,
    setHome,
    homeVerse,
    intelligentSpacebar,
  },
) => {
  const handleIntelligentSpacebar = (nextIndex, currentVerseIndex) => {
    let nextVerseIndex = nextIndex;

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
    return nextVerseIndex;
  };

  if (homeVerse) {
    const currentVerseIndex = filteredItems.findIndex(({ verseId }) => verseId === activeVerseId);
    let nextVerseIndex = homeVerse;

    if (intelligentSpacebar) {
      nextVerseIndex = handleIntelligentSpacebar(nextVerseIndex, currentVerseIndex);
    }

    const nextVerseId = filteredItems[nextVerseIndex].verseId;
    return { verseId: nextVerseId, verseIndex: nextVerseIndex };
  }
  return null;
};
