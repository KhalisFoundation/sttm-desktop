const { store } = require('electron').remote.require('./app');

// other essential imports
const copy = require('copy-to-clipboard');
const anvaad = require('anvaad-js');
const search = require('./search');
const baniDB = require('../js/banidb/index.js');

const baniLengthMap = search.baniLengthCols;

// defualt these to true, so that we only need to change them if they are turned off
let copyEngTranslation = true;
let copyPunjabiTranslation = true;
let copyTranslit = true;

let isCeremony;
let isBani;
const baniLength = store.getUserPref('toolbar.gurbani.bani-length');

// storing pulled shabad/bani from db in array to avoid calling db too much
const pankteeArray = [];

function remapShabad(unmapped) {
  pankteeArray.length = 0;
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
    isCeremony = false;
    isBani = false;
    result = await baniDB.loadShabad(id);
    remapShabad(result);
  } else if (idType === 'bani') {
    pankteeArray.length = 0;
    isCeremony = false;
    isBani = true;
    baniDB.loadBani(id, baniLengthMap[baniLength]).then(row => {
      const remappedRow = global.controller.remapLine(row);
      pankteeArray.push(remappedRow);
    });
  } else if (idType === 'ceremony') {
    isCeremony = true;
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
function checkDB(remappedLine, bani, ceremony) {
  if (bani) {
    if (copyEngTranslation) {
      copyEngTranslation = !(remappedLine.Verse.English === null);
    }
    if (copyPunjabiTranslation) {
      copyPunjabiTranslation = !(remappedLine.Verse.English === null);
    }
    if (copyTranslit) {
      copyTranslit = !(remappedLine.Verse.English === null);
    }
  } else if (ceremony) {
    console.log('ceremony');
  } else {
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
}
function variablyCopy(panktee, bani, ceremony) {
  let toBeCopied;
  const elementsArray = [
    [copyEngTranslation, 'English'],
    [copyPunjabiTranslation, 'Punjabi'],
    [copyTranslit, 'Transliteration'],
  ];
  if (bani) {
    const newPanktee = global.controller.remapLine(panktee.Verse);
    toBeCopied = anvaad.unicode(newPanktee.Gurmukhi);
    for (let i = 0; i < elementsArray.length; i += 1) {
      if (elementsArray[i][0]) {
        toBeCopied += panktee.Verse.indexOf(elementsArray[1][1]);
      }
    }
  } else if (ceremony) {
    console.log(ceremony);
  } else {
    toBeCopied = anvaad.unicode(panktee.Gurmukhi);
    if (copyEngTranslation) {
      toBeCopied += `\n\n${panktee.English}`;
    }
    if (copyPunjabiTranslation) {
      toBeCopied += `\n\n${anvaad.unicode(panktee.Punjabi)}`;
    }
    if (copyTranslit) {
      toBeCopied += `\n\n${panktee.Transliteration}`;
    }
  }
  return toBeCopied;
}
async function copyPanktee() {
  checkDisplaySettings();
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const panktee = pankteeArray.length === 1 ? pankteeArray[0][linePos] : pankteeArray[linePos];
  checkDB(panktee, isBani, isCeremony);
  const final = variablyCopy(panktee, isBani, isCeremony);
  copy(final);
}

module.exports = {
  loadFromDB,
  copyPanktee,
};
