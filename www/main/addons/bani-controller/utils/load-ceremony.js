import loadVerse from './load-verse';

const loadCeremony = (ceremonyId, crossPlatformId, lineCount) => {
  const currentCeremonyID = global.core.search.getCurrentShabadId().id;
  if (currentCeremonyID === ceremonyId) {
    loadVerse(crossPlatformId, lineCount);
  } else {
    global.core.search.loadCeremony(ceremonyId, null, false, crossPlatformId);
  }
};

export default loadCeremony;
