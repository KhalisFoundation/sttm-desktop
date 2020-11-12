import { remote } from 'electron';

const analytics = remote.getGlobal('analytics');

const loadCeremonyGlobal = id => {
  global.core.search.loadCeremony(id).catch(error => {
    analytics.trackEvent('ceremonyFailed', id, error);
  });
  global.core.copy.loadFromDB(id, 'ceremony');
};

export default loadCeremonyGlobal;
