import React from 'react';
// Constants
import { SOURCE_TEXTS as sourceTexts } from '../../shared/banidb/constants';

export default () => (
  <div id="search-options">
    <span className="filter-text" />
    <select id="search-source">
      {/* h(
        'select#search-source',
        {
          onchange() {
            module.exports.changeSearchSource(this.value);
            document.getElementById('source-selection').innerText = CONSTS.SOURCE_TEXTS[this.value];
          },
        },
        sourceOptions,
      ), */}
      {Object.keys(sourceTexts).map(key => (
        <option key={key} value={key}>
          {sourceTexts[key]}
        </option>
      ))}
    </select>
    {/* h(
      'label.filter-text#source-selection',
      { htmlFor: 'search-source' },
      CONSTS.SOURCE_TEXTS[store.get('searchOptions.searchSource')],
    ), */}
  </div>
);
