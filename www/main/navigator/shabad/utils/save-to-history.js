export const saveToHistory = (
  shabadId,
  verses,
  verseType,
  { verseHistory, setVerseHistory, baniLength },
  initialVerse = null,
) => {
  const firstVerse = verses[0];
  const verseId = initialVerse || firstVerse.verseId;
  const firstVerseIndex = verses.findIndex((v) => v.verseId === verseId);
  let baniId = shabadId;
  let verse;
  if (verseType === 'shabad') {
    if (initialVerse) {
      const clickedVerse = verses.filter((verseObj) => verseObj.ID === initialVerse);
      verse = clickedVerse.length && clickedVerse[0].Gurmukhi;
    } else {
      verse = firstVerse.verse;
    }
  } else if (verseType === 'bani') {
    verse = firstVerse.baniName;
    baniId = firstVerse.baniId;
  } else if (verseType === 'ceremony') {
    verse = firstVerse.ceremonyName;
    baniId = firstVerse.ceremonyId;
  }
  const check = verseHistory.filter((historyObj) => historyObj.shabadId === baniId);
  if (check.length === 0) {
    const updatedHistory = [
      {
        shabadId: baniId,
        verseId,
        label: verse,
        type: verseType,
        meta: {
          baniLength,
        },
        versesRead: [verseId],
        continueFrom: verseId,
        homeVerse: firstVerseIndex,
      },
      ...verseHistory,
    ];
    setVerseHistory(updatedHistory);
    return true;
  }
  return false;
};
