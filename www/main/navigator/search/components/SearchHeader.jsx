import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function SearchHeader() {
  const language = useStoreState(state => state.navigator);
  const setLanguage = useStoreActions(state => state.navigator);

  const handleLanguageChange = event => {
    if (event.target.value == 'en') {
      setLanguage.setSearchOption('Full Words');
    } else {
      setLanguage.setSearchOption('First Letter (Start)');
    }
    setLanguage.setDefaultLanguage(event.target.value);
  };
  const handleSearchType = event => {
    setLanguage.setSearchOption(event.target.value);
  };

  return (
    <>
      <div className="language-selector">
        <label className="gurmukhi">
          <input
            type="radio"
            value="gr"
            id="gurmukhi-language"
            checked={language.defaultLanguage === 'gr'}
            onChange={handleLanguageChange}
          />
          aAe
        </label>
        <label className="english">
          <input
            type="radio"
            value="en"
            id="english-language"
            onChange={handleLanguageChange}
            checked={language.defaultLanguage === 'en'}
          />
          ABC
        </label>
      </div>
      <div className="search-type">
        {language.defaultLanguage === 'gr' ? (
          <select onChangeCapture={handleSearchType}>
            <option value="First Letter (Start)">First Letter (Start)</option>
            <option value="First Letter (Anywhere)">First Letter (Anywhere)</option>
            <option value="Full Word(s)">Full Word(s)</option>
          </select>
        ) : (
          <select onChangeCapture={handleSearchType}>
            <option value="Full Word(s)">Full Word(s)</option>
          </select>
        )}
      </div>
    </>
  );
}

export default SearchHeader;
