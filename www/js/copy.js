// electron and setting-related imports
const electron = require('electron');

const { remote } = electron;
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

/**
 * check if any display settings are turned off
 */
function checkDisplaySettings() {
  copyEngTranslation = store.getUserPref('slide-layout.fields.display-translation');
  copyPunjabiTranslation = store.getUserPref('slide-layout.fields.display-teeka');
  copyTranslit = store.getUserPref('slide-layout.fields.display-transliteration');
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

async function copyPanktee() {
  checkDisplaySettings();

  const shabadID = global.core.search.clickedShabadID;
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const result = await searchMethods.loadShabad(shabadID);
  const remapped = global.controller.remapLine(result[linePos]);

  checkDB(remapped);
  let toBeCopied = anvaad.unicode(remapped.Gurmukhi);
  if (copyEngTranslation) {
    toBeCopied += `\n${remapped.English}`;
  }
  if (copyPunjabiTranslation) {
    toBeCopied += `\n${anvaad.unicode(remapped.Punjabi)}`;
  }
  if (copyTranslit) {
    toBeCopied += `\n${remapped.Transliteration}`;
  }
  copy(toBeCopied);
}

module.exports = {
  copyPanktee,
};
