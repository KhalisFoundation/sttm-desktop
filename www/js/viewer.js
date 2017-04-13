/* eslint global-require: 0, import/no-unresolved: 0 */
const platform = global.platform || require('./js/desktop_scripts');
const h = require('hyperscript');

const decks = [];
let currentShabad;
const $message = document.getElementById('message');
const $body = document.body;
const $viewer = document.getElementById('viewer');

$body.classList.add(process.platform);

function hideDecks() {
  Array.from(document.querySelectorAll('.deck')).forEach((el) => {
    el.classList.remove('active');
  });
}

function changeTheme(theme) {
  $body.classList.forEach((bodyClass) => {
    if (bodyClass.indexOf('theme') > -1) {
      // $body.classList.remove(i);
    }
  });
  $body.classList.add(theme);
}

function applyPresenterPrefs(prefs) {
  // changeTheme(prefs.theme);
  changeTheme('light-theme');
}

const prefs = platform.store.get('userPrefs.presenterWindow');
applyPresenterPrefs(prefs);

// IPC
platform.ipc.on('show-line', (event, data) => {
  module.exports.showLine(data.shabadID, data.lineID);
});

platform.ipc.on('show-text', (event, data) => {
  module.exports.showText(data.text);
});

module.exports = {
  showLine(shabadID, lineID) {
    const newShabadID = parseInt(shabadID, 10);
    if (decks.indexOf(newShabadID) > -1) {
      const $shabadDeck = document.getElementById(`shabad${newShabadID}`);
      if (currentShabad !== newShabadID || !$shabadDeck.classList.contains('active')) {
        hideDecks();
        $shabadDeck.classList.add('active');
        currentShabad = newShabadID;
      }
      Array.from($shabadDeck.querySelectorAll('.slide')).forEach(el => el.classList.remove('active'));
      document.getElementById(`slide${lineID}`).classList.add('active');
    } else {
      platform.db.all(`SELECT v.ID, v.Gurmukhi, v.English, v.transliteration, v.PunjabiUni FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = ${newShabadID} ORDER BY v.ID ASC`,
        (err, rows) => {
          if (rows.length > 0) {
            const cards = [];
            rows.forEach((row) => {
              cards.push(
                h(
                  `div#slide${row.ID}.slide${row.ID === lineID ? '.active' : ''}`,
                  [
                    h('h1.gurbani.gurmukhi', row.Gurmukhi),
                    h('h2.translation', row.English),
                    h('h2.transliteration', row.Transliteration),
                    h('h2.teeka', row.PunjabiUni),
                  ]));
            });
            hideDecks();
            $viewer.appendChild(h(`div#shabad${newShabadID}.deck.active`, cards));
            currentShabad = parseInt(newShabadID, 10);
            decks.push(newShabadID);
          }
        });
    }
  },

  showText(text) {
    hideDecks();
    $message.classList.add('active');
    while ($message.firstChild) {
      $message.removeChild($message.firstChild);
    }
    $message.appendChild(h('div.slide.active', h('h1.gurmukhi.gurbani', text)));
  },
};
