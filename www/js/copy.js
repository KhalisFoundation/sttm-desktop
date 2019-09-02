const { store } = require('electron').remote.require('./app');

// other essential imports
const copy = require('copy-to-clipboard');
const sanitizeHtml = require('sanitize-html');
const anvaad = require('anvaad-js');
const search = require('./search');
const baniDB = require('../js/banidb/index.js');

const baniLengthMap = search.baniLengthCols;

// defualt these to true, so that we only need to change them if they are turned off
let copyEngTranslation = true;
let copyPunjabiTranslation = true;
let copyTranslit = true;

const baniLength = store.getUserPref('toolbar.gurbani.bani-length');

// storing pulled shabad/bani from db in array to avoid calling db too much
const pankteeArray = [];

/**
 *
 * @param {String} htmlString explanation text from ceremonies
 * uses sanitize html to remove all html tags from text
 */
function stripHTML(htmlString) {
  const allowedTags = [];
  const allowedAttributes = {};
  const cleanText = sanitizeHtml(htmlString.English, { allowedTags, allowedAttributes });
  return cleanText;
}
/**
 *
 * @param {Objects} unmapped rows from the DB
 * remaps each row
 */
function remapShabad(unmapped) {
  pankteeArray.length = 0;
  unmapped.forEach(row => {
    const remappedRow = global.controller.remapLine(row);
    pankteeArray.push(remappedRow);
  });
}
/**
 *
 * @param {Objects} unmapped rows fresh from DB
 * for each row, it sees if row.Verse (normal panktees) row.Custom (custom symbols or text) is available
 * if not, it just displays title (because those two will only not be available at the position of the title)
 * Then, it remapps the correct part of the row Object
 */
function remapBani(unmapped) {
  pankteeArray.length = 0;
  for (let i = 0; i < unmapped.length; i += 1) {
    const row = unmapped[i];
    let toBeRemapped;
    if (row.Verse) {
      toBeRemapped = row.Verse;
    } else if (row.Custom) {
      toBeRemapped = row.Custom;
    } else {
      toBeRemapped = row.Bani.Gurmukhi;
    }
    const remapped = global.controller.remapLine(toBeRemapped);
    pankteeArray.push(remapped);
  }
}
/**
 *
 * @param {Objects} unmapped rows fresh from DB to be remapped
 * similar to remapBani, except includes html stripping for explanation slides and looks for title at row.Ceremony
 */
function remapCeremony(unmapped) {
  pankteeArray.length = 0;
  let removeHTML;
  for (let i = 0; i < unmapped.length; i += 1) {
    const row = unmapped[i];
    let toBeRemapped;
    if (row.Verse) {
      removeHTML = false;
      toBeRemapped = row.Verse;
    } else if (row.Custom) {
      removeHTML = true;
      toBeRemapped = row.Custom;
    } else {
      removeHTML = false;
      toBeRemapped = row.Ceremony.Gurmukhi;
    }
    const remapped = global.controller.remapLine(toBeRemapped);
    if (removeHTML) {
      pankteeArray.push(stripHTML(remapped));
    } else {
      pankteeArray.push(remapped);
    }
  }
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
    baniDB.loadBani(id, baniLengthMap[baniLength]).then(rows => {
      remapBani(rows);
    });
  } else if (idType === 'ceremony') {
    baniDB.loadCeremony(id).then(rows => {
      remapCeremony(rows);
    });
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
/**
 *
 * @param {Object} panktee the remapped panktee currently sitting in the panktee array and/or and html sanitized text (in case of ceremony)
 */
function variablyCopy(panktee) {
  let toBeCopied;
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

  /* case when the explanation text for ceremonies is the line to be copied because due to how the html is stripped
  from the text, it leaves just the text, and no other properties of the object
  */
  if (!(panktee.English && panktee.Punjabi && panktee.Transliteration)) {
    toBeCopied = panktee;
  }
  return toBeCopied;
}
/**
 * First checks display settings to see what the user wants
 * Then it checks if those things are actually available in the DB
 * Lastly, then it copies the relevant parts of the pankteee
 */
async function copyPanktee() {
  checkDisplaySettings();
  const linePos = search.currentShabad.indexOf(search.currentLine);
  const panktee = pankteeArray[linePos];
  checkDB(panktee);
  copy(variablyCopy(panktee));
}

module.exports = {
  loadFromDB,
  copyPanktee,
};
