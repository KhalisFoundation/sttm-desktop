const h = require('hyperscript');
const getJSON = require('get-json');

const trayItemFactory = (label) => h(
    'div.tray-item',
    label
);

module.exports = {
    init() {
        const shortcutTrayContainer = document.querySelector('.shortcut-tray');
        console.log(shortcutTrayContainer);
        shortcutTrayContainer.appendChild(trayItemFactory("Waheguru"));
        shortcutTrayContainer.appendChild(trayItemFactory("Anand Sahib"));
    }
}

