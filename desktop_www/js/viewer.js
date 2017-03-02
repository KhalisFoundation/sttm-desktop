const platform = require("./js/desktop_scripts");
const h = require("../www/js/h");
const decks = [];
let currentShabad,
    currentLine;
const $message  = document.getElementById("message");
const $body     = document.body;

$body.classList.add(process.platform);

let prefs = platform.store.get("userPrefs.presenterWindow");
applyPresenterPrefs(prefs);

//IPC
platform.ipc.on("show-line", function(event, data) {
  const newShabadID = parseInt(data.shabadID);
  if (decks.indexOf(newShabadID) > -1) {
    const $shabadDeck = document.getElementById("shabad" + newShabadID);
    if (currentShabad != newShabadID || !$shabadDeck.classList.contains("active")) {
      hideDecks();
      $shabadDeck.classList.add("active");
      currentShabad = newShabadID;
    }
    Array.from($shabadDeck.querySelectorAll(".slide")).forEach(el => el.classList.remove("active"));
    document.getElementById("slide" + data.lineID).classList.add("active");
  } else {
    let stmt = db.all("SELECT _id, gurmukhi, english_ssk, transliteration, sggs_darpan FROM shabad WHERE shabad_no = " + newShabadID,
      (err, rows) => {
        if (rows.length > 0) {
          let cards = [];
          rows.forEach((row, i) => {
            cards.push(
              h("div", { id: "slide" + row._id, class: "slide" + (row._id == data.lineID ? " active" : "") }, [
                h("h1", { class: "gurbani gurmukhi" }, row.gurmukhi),
                h("h2", { class: "translation" }, row.english_ssk),
                h("h2", { class: "transliteration" }, row.transliteration),
                h("h2", { class: "teeka" }, row.sggs_darpan)
              ])
            );
          });
          hideDecks();
          $body.appendChild(h("div", { id: "shabad" + newShabadID, class: "deck active" }, cards));
          currentShabad = parseInt(newShabadID);
          decks.push(newShabadID);
        }
      }
    );
  }
});

platform.ipc.on("show-text", function(event, data) {
  hideDecks();
  $message.classList.add("active");
  while ($message.firstChild) {
    $message.removeChild($message.firstChild);
  }
  $message.appendChild(h("div", { class: "slide active" }, h("h1", { class: "gurmukhi gurbani" }, data.text)));
});

function hideDecks() {
  Array.from(document.querySelectorAll(".deck")).forEach(el => {
    el.classList.remove("active")
  });
}

function applyPresenterPrefs(prefs) {
  changeTheme(prefs.theme);
}
function changeTheme(theme) {
  $body.classList.forEach(bodyClass => {
    if (bodyClass.indexOf("theme") > -1) {
      $body.classList.remove(i);
    }
  });
  $body.classList.add(theme);
}
