import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
function SearchResults() {
  const verse = useStoreState(state => state.navigator.verseSelected);

  const activeVerse = () => {
    console.log('event captured');
  };
  return (
    <div className="search-results">
      {verse ? (
        <div className="result-list">
          <ul className="gurmukhi">
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
            <li className="gurkukhi" onClick={activeVerse}>
              <a className="panktee">{verse}</a>
            </li>
          </ul>{' '}
        </div>
      ) : (
        ''
      )}
    </div>
  );
}

export default SearchResults;
