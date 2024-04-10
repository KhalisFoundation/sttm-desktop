export const changeVerse = (
  newTraversedVerse,
  verseIndex,
  clickedShabad,
  { activeVerseId, setActiveVerseId, setActiveVerse, setActiveShabadId, activeShabadId },
) => {
  if (clickedShabad !== activeShabadId) {
    setActiveShabadId(clickedShabad);
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
  { isSundarGutkaBani, sundarGutkaBaniId, isCeremonyBani, ceremonyId, activeShabadId, homeVerse },
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
        homeId: homeVerse,
        verseChange: false,
      });
    }
  }
};
