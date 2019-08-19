const { store } = require('electron').remote.require('./app');

// other essential imports
const copy = require('copy-to-clipboard');
const anvaad = require('anvaad-js');
const search = require('./search');
const baniDB = require('../js/banidb/index.js');

// defualt these to true, so that we only need to change them if they are turned off
let copyEngTranslation = true;
let copyPunjabiTranslation = true;
let copyTranslit = true;
const baniLength = store.getUserPref('toolbar.gurbani.bani-length');
// storing pulled shabad/bani from db in array to avoid calling db too much
const pankteeArray = [];

function remapShabad(unmapped) {
  unmapped.forEach(row => {
    const remappedRow = global.controller.remapLine(row);
    pankteeArray.push(remappedRow);
  });
}
/**
 *
 * @param {number} id id given to the shabad/bani/ceremony in db
 * @param {String} idType specifies if the gurbani is identified as a 'bani', 'shabad', or 'ceremony' in db
 */
async function loadFromDB(id, idType) {
  let result;

  if (idType === 'shabad') {
    result = await baniDB.loadShabad(id);
    remapShabad(result);
  } else if (idType === 'bani') {
    baniDB.loadBani(id, baniLength).then(row => {
      const remappedRow = global.controller.remapLine(row);
      pankteeArray.push(remappedRow);
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

async function copyPanktee() {
  checkDisplaySettings();
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const panktee = pankteeArray[linePos];
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
