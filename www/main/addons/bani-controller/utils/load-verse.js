import { remote } from 'electron';

const { store } = remote.require('./app');

const loadVerse = (crossPlatformId, lineCount) => {
  const lineHeight = 35.6; // height of verse in shabad pane, unit: pixels
  const $shabad = document.getElementById('shabad');
  $shabad.parentElement.scrollTo(0, parseInt(lineCount - 1, 10) * lineHeight);
  const currentVerse = document.querySelector(`[data-cp-id = "${crossPlatformId}"]`);
  if (currentVerse) {
    currentVerse.click();
  } else {
    store.set('GlobalState', {
      currentVerseSelector: `[data-cp-id = "${crossPlatformId}"]`,
    });
  }
};

export default loadVerse;
