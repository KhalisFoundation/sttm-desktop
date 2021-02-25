import React from 'react';

function GurbaniKeyboard() {
  const keyboardLayout = require('../../../configs/keyboard.json');

  Object.keys(keyboardLayout).forEach(i => {
    const klPage = keyboardLayout[i];
    const page = [];
    Object.keys(klPage).forEach(j => {
      const klRow = klPage[j];
      const row = [];

      Object.keys(klRow).forEach(k => {
        const klRowSet = klRow[k];
        const rowSet = [];

        Object.keys(klRowSet).forEach(l => {
          const klButton = klRowSet[l];
          if (typeof klButton === 'object') {
            rowSet.push(
              h(
                'button',
                {
                  type: 'button',
                  onclick: e => module.exports.clickKBButton(e, klButton.action),
                },
                klButton.icon ? h(klButton.icon) : klButton.char,
              ),
            );
          } else {
            rowSet.push(
              h(
                'button',
                {
                  type: 'button',
                  onclick: e => module.exports.clickKBButton(e),
                },
                klButton,
              ),
            );
          }
        });
        row.push(h('div.keyboard-row-set', rowSet));
      });
      page.push(h('div.keyboard-row', row));
    });
    kbPages.push(
      h(
        `div#gurmukhi-keyboard-page-${parseInt(i, 10) + 1}.page${
          parseInt(i, 10) === 0 ? '.active' : ''
        }`,
        page,
      ),
    );
  });
}

export default GurbaniKeyboard;
