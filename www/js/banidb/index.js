/* eslint-disable global-require */
const CONSTS = require('./constants');
const os = require('os');

let search;

const platform = os.platform();
if (platform === 'win32') {
  const version = /\d+\.\d/.exec(os.release())[0];
  if (version !== '6.3' && version !== '10.0') {
    search = require('./sqlite-search');
  }
}
if (!search) {
  search = require('./realm-search');
}

const {
  query,
  loadShabad,
  loadBanis,
  loadBani,
  loadCeremony,
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
  getAng,
  loadAng,
  getShabad,
  randomShabad,
};
