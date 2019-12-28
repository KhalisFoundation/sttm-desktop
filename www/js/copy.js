const { store } = require('electron').remote.require('./app');

// other essential imports
const copy = require('copy-to-clipboard');
const sanitizeHtml = require('sanitize-html');
const anvaad = require('anvaad-js');
const search = require('./search');
const baniDB = require('../js/banidb/index.js');

const baniLengthMap = search.baniLengthCols;
const baniLength = store.getUserPref('toolbar.gurbani.bani-length');
const mangalPosition = store.get('userPrefs.toolbar.gurbani.mangal-position');
let mangalPosString = '';

if (mangalPosition === 'above') {
  mangalPosString = 'above';
} else {
  mangalPosString = 'current';
}
let isCeremony;
// storing pulled shabad/bani from db in array to avoid calling db too much
const pankteeArray = [];

function findLinePosition() {
  const currentPanktee = document.querySelector('a.panktee.seen_check.current');
  const arr = Array.from(document.querySelector('#shabad.gurmukhi').childNodes);
  return arr.indexOf(currentPanktee.parentNode);
}
/**
 *
 * @param {number} id id given to the shabad/bani/ceremony in db
 * @param {String} idType specifies if the gurbani is identified as a 'bani', 'shabad', or 'ceremony' in db
 */
async function loadFromDB(id, idType) {
  let result;
  pankteeArray.length = 0;

  if (idType === 'shabad') {
    isCeremony = false;
    result = await baniDB.loadShabad(id);
    result.forEach(row => {
      const remappedRow = global.controller.remapLine(row);
      pankteeArray.push(remappedRow);
    });
  } else {
    isCeremony = idType === 'ceremony';
    result = isCeremony ? baniDB.loadCeremony(id) : baniDB.loadBani(id, baniLengthMap[baniLength]);
    result.then(rowsDb => {
      const rows = rowsDb
        .filter(rowDb => rowDb.MangalPosition !== mangalPosString)
        .map(rowDb => {
          const row = rowDb;
          let toBeRemapped;
          // if the obj has panktees
          if (row.Verse) {
            toBeRemapped = row.Verse;
            // or if it doesnt and has a custom item, like the flower thing is asa di vaar
          } else if (row.Custom) {
            toBeRemapped = row.Custom;
            // otherwise, both being false means that we are looking at the bani header, so we should copy the name/header value
          } else {
            toBeRemapped = isCeremony ? row.Ceremony.Gurmukhi : rows.Bani.Gurmukhi;
          }
          const remapped = global.controller.remapLine(toBeRemapped);
          pankteeArray.push(remapped);
          return row;
        });
    });
  }
}

/**
 *
 * @param {String} htmlString explanation text from ceremonies
 * uses sanitize html to remove all html tags from text
 */
function stripHTML(htmlString) {
  const allowedTags = [];
  const allowedAttributes = {};
  return sanitizeHtml(htmlString, { allowedTags, allowedAttributes });
}

/**
 * First checks display settings to see what the user wants
 * Then it checks if those things are actually available in the DB
 * Lastly, then it copies the relevant parts of the pankteee
 */
async function copyPanktee() {
  const translationLang = store.getUserPref('slide-layout.language-settings.translation-language');
  const translitLang = store.getUserPref('slide-layout.language-settings.transliteration-language');

  // find the position of the panktee from the lines pulled from DB
  const linePos = findLinePosition();
  const panktee = pankteeArray[linePos];
  // check all properties
  const copyTranslation =
    store.getUserPref('slide-layout.fields.display-translation') &&
    !(panktee[`${translationLang}`] === null);
  const copyTeeka =
    store.getUserPref('slide-layout.fields.display-teeka') && !(panktee.Punjabi === null);
  const copyTranslit =
    store.getUserPref('slide-layout.fields.display-transliteration') && !(panktee.Punjabi === null);

  // start asigning the props from Object based on if they are to be copied
  let toBeCopied = '';
  if (panktee.Gurmukhi != null) {
    toBeCopied = anvaad.unicode(panktee.Gurmukhi);
  }

  if (copyTranslation) {
    if (isCeremony && panktee.Gurmukhi === null) {
      toBeCopied += `\n\n${stripHTML(panktee.English)}`;
    } else {
      toBeCopied += `\n\n${panktee[`${translationLang}`]}`;
    }
  }
  if (copyTeeka) {
    toBeCopied += `\n\n${anvaad.unicode(panktee.Punjabi)}`;
  }
  if (copyTranslit) {
    toBeCopied += `\n\n${panktee.Transliteration[`${translitLang}`]}`;
  }

  // finally, copy to the clipboard
  copy(toBeCopied);
}

module.exports = {
  stripHTML,
  loadFromDB,
  copyPanktee,
};
