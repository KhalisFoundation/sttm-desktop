const CONSTS = require('./constants');

const search = require('./realm-search');

const {
  query,
  loadShabad,
  loadFirstLetterIndex,
  loadBanis,
  loadBani,
  loadBaniIndex,
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
  loadShabad,
  loadFirstLetterIndex,
  loadBanis,
  loadBani,
  loadBaniIndex,
  loadCeremony,
  loadCeremonies,
  loadVerses,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
  getVerse,
};
