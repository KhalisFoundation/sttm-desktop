import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
// Actions
import { updateSearchSource } from '../../shared/actions/searchOptions';
// Constants
import { SOURCE_TEXTS as sourceTexts } from '../../shared/banidb/constants';

export default () => {
  const { searchOptions } = useSelector(state => state);
  const dispatch = useDispatch();
  return (
    <div id="search-options">
      <span className="filter-text" />
      <select
        id="search-source"
        onChange={e => dispatch(updateSearchSource(e.target.value))}
        value={searchOptions.source}
      >
        {Object.keys(sourceTexts).map(key => (
          <option key={key} value={key}>
            {sourceTexts[key]}
          </option>
        ))}
      </select>
      <label className="filter-text" id="source-selection" htmlFor="search-source">
        {sourceTexts[searchOptions.source]}
      </label>
    </div>
  );
};
