import { broadcastHistory } from '../../../addons/bani-controller/controller-bus';

export const saveToHistory = (
  shabadId,
  verses,
  verseType,
  { verseHistory, setVerseHistory, baniLength },
  initialVerse = null,
) => {
  const firstVerse = verses[0];
  let verseId;
  if (initialVerse === null) {
    verseId = firstVerse.ID;
  } else {
    verseId = initialVerse;
  }
  const firstVerseIndex = verses.findIndex((v) => v.verseId === verseId);
  let baniId = shabadId;
  let verse;
  if (verseType === 'shabad') {
    if (initialVerse) {
      const clickedVerse = verses.filter((verseObj) => verseObj.ID === initialVerse);
      if (!clickedVerse.length) {
        verse = firstVerse.Gurmukhi;
      } else {
        verse = clickedVerse.length && clickedVerse[0].Gurmukhi;
      }
    } else {
      verse = firstVerse.Gurmukhi;
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
    const newEntry = {
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
    };
    setVerseHistory([newEntry, ...verseHistory]);
    // Mirror the new entry to a connected web controller, if any. No-op when
    // no controller session is active.
    broadcastHistory('add', {
      entry: {
        shabadId: newEntry.shabadId,
        verseId: newEntry.verseId,
        label: newEntry.label,
        kind: verseType === 'bani' || verseType === 'ceremony' ? verseType : 'shabad',
      },
    });
    return true;
  }
  return false;
};
