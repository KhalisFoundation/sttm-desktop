const CONSTS = require('./constants');

const search = require('./realm-search');

const {
  query,
  prepareSearch,
  loadShabad,
  loadBanis,
  loadBani,
  loadCeremony,
  loadCeremonies,
  loadVerses,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
  getVerse,
} = search;

// Re-export CONSTS for use in other areas
module.exports = {
  CONSTS,
  query,
  prepareSearch,
  loadShabad,
  loadBanis,
  loadBani,
  loadCeremony,
  loadCeremonies,
  loadVerses,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
  getVerse,
};
