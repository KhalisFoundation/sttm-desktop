const CONSTS = require('./constants');

const search = require('./realm-search');

const {
  query,
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
} = search;

// Re-export CONSTS for use in other areas
module.exports = {
  CONSTS,
  query,
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
};
