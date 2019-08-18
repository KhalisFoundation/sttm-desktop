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
const baniLength = store.getUserPref('toolbar.gurbani.bani-length');
// storing pulled shabad/bani from db in array to avoid calling db too much
let pankteeArray = [];

/**
 *
 * @param {number} id id given to the shabad/bani/ceremony in db
 * @param {String} idType specifies if the gurbani is identified as a 'bani', 'shabad', or 'ceremony' in db
 */
async function loadFromDB(id, idType) {
  let result;
  let remappedLine;

  if (idType === 'shabad') {
    result = await searchMethods.loadShabad(id);
    result.forEach(panktee => {
      remappedLine = global.controller.remapLine(panktee);
      pankteeArray.push(remappedLine);
    });
  } else if (idType === 'bani') {
    result = await searchMethods.loadBani(id, baniLength);
    result.forEach(panktee => {
      remappedLine = global.controller.remapLine(panktee);
      pankteeArray.push(remappedLine);
    });
  } else if (idType === 'ceremony') {
    console.log('ceremony');
  }
}

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

function copyPanktee() {
  console.log(pankteeArray.length);
  checkDisplaySettings();
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const panktee = pankteeArray[linePos];
  console.log(linePos);
  console.log(pankteeArray);
  checkDB(panktee);
  let toBeCopied = anvaad.unicode(panktee.Gurmukhi);

  if (copyEngTranslation) {
    toBeCopied += `\n\n${panktee.English}`;
  }
  if (copyPunjabiTranslation) {
    toBeCopied += `\n\n${anvaad.unicode(panktee.Punjabi)}`;
  }
  if (copyTranslit) {
    toBeCopied += `\n\n${panktee.Transliteration}`;
  }
  copy(toBeCopied);
}

module.exports = {
  loadFromDB,
  copyPanktee,
};
