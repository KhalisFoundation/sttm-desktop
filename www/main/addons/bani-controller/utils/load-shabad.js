/* We need gurmukhi here to add for history support.
Will no longer be needed when we move to better state management */
const loadShabad = (
  shabadId,
  verseId,
  activeShabadId,
  activeVerseId,
  updateShabad,
  updateVerse,
) => {
  if (activeShabadId === shabadId) {
    if (activeVerseId !== verseId) {
      updateVerse(verseId);
    }
  } else {
    updateShabad(activeShabadId, activeVerseId);
  }
};

export default loadShabad;
