import { remote } from 'electron';

const analytics = remote.getGlobal('analytics');

const loadBani = (bani, onScreenClose) => () => {
  analytics.trackEvent('sunderGutkaBanis', bani.token);
  global.core.search.loadBani(bani.id);
  global.core.copy.loadFromDB(bani.id, 'bani');
  onScreenClose();
};

export default loadBani;
