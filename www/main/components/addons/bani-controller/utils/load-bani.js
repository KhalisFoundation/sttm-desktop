import loadVerse from './load-verse';

const loadBani = (BaniId, crossPlatformId, lineCount) => {
  const currentBaniID = global.core.search.getCurrentShabadId().id;
  if (currentBaniID === BaniId) {
    loadVerse(crossPlatformId, lineCount);
  } else {
    global.core.search.loadBani(BaniId, null, false, crossPlatformId);
  }
};

export default loadBani;
