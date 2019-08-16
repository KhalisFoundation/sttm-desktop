const { store } = require('electron').remote.require('./app');

// other essential imports
const copy = require('copy-to-clipboard');
const anvaad = require('anvaad-js');
const search = require('./search');
const searchMethods = require('../js/banidb/index.js');

// defualt these to true, so that we only need to change them if they are turned off
let copyEngTranslation = true;
let copyPunjabiTranslation = true;
let copyTranslit = true;

let baniLength;

/**
 * @param {Bool} isBani identify if you want to check for bani-related settings
 * check if any display settings are turned off
 */
function checkDisplaySettings(isBani) {
  if (isBani) {
    baniLength = store.getUserPref('toolbar.gurbani.bani-length');
  } else {
    copyEngTranslation = store.getUserPref('slide-layout.fields.display-translation');
    copyPunjabiTranslation = store.getUserPref('slide-layout.fields.display-teeka');
    copyTranslit = store.getUserPref('slide-layout.fields.display-transliteration');
  }
}

async function loadFromDB(isBani, baniID, shabadID) {
  let result;
  if (isBani) {
    result = await searchMethods.loadBani(baniID);
  } else {
    result = await searchMethods.loadShabad(shabadID);
  }
  return result;
}
/**
 * @param {Object} remappedLine all the fields of the line from the DB
 * check DB for fields that are selected to be displayed and check if they are null
 */
function checkDB(remappedLine) {
  if (copyEngTranslation) {
    copyEngTranslation = !(remappedLine.English === null);
  }
  if (copyPunjabiTranslation) {
    copyPunjabiTranslation = !(remappedLine.Punjabi === null);
  }
  if (copyTranslit) {
    copyTranslit = !(remappedLine.Transliteration === null);
  }
}

async function copyPanktee(clickedOnBani) {
  checkDisplaySettings(true);

  // for shabad
  const shabadID = global.core.search.clickedShabadID;
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const result = await searchMethods.loadShabad(shabadID);
  const remapped = global.controller.remapLine(result[linePos]);

  // bani
  // const baniID =

  checkDB(remapped);
  let toBeCopied = anvaad.unicode(remapped.Gurmukhi);

  if (copyEngTranslation) {
    toBeCopied += `\n\n${remapped.English}`;
  }
  if (copyPunjabiTranslation) {
    toBeCopied += `\n\n${anvaad.unicode(remapped.Punjabi)}`;
  }
  if (copyTranslit) {
    toBeCopied += `\n\n${remapped.Transliteration}`;
  }
  copy(toBeCopied);
}

module.exports = {
  copyPanktee,
};
