/* We need gurmukhi here to add for history support.
Will no longer be needed when we move to better state management */
const loadShabad = (shabadId, verseId, gurmukhi) => {
  const currentShabadID = global.core.search.getCurrentShabadId().id;
  const currentVerse = document.querySelector(`#line${verseId}`);
  // If its not new shabad but just a verse change in current shabad
  if (currentShabadID === shabadId && currentVerse) {
    currentVerse.click();
  } else {
    // if its a new shabad load it and add it to history
    global.core.search.loadShabad(shabadId, verseId);
    global.core.search.addToHistory(shabadId, verseId, gurmukhi);
  }
};

export default loadShabad;
