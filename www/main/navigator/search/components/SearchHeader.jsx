import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { remote } from 'electron';

function SearchHeader() {
  const banidb = require('../../../common/constants/banidb');
  const { i18n } = remote.require('./app');
  const gurmukhiSearchText = banidb.GURMUKHI_SEARCH_TEXTS;
  const gurmukhiSearchTypes = Object.keys(gurmukhiSearchText);
  const englishSearchText = banidb.ENGLISH_SEARCH_TEXTS;
  const englishSearchTypes = Object.keys(englishSearchText);
  const navigator = useStoreState(state => state.navigator);
  const setNavigator = useStoreActions(state => state.navigator);
  const handleLanguageChange = event => {
    if (event.target.value == 'en') {
      setNavigator.setSearchOption(i18n.t(`SEARCH.${englishSearchText[3]}`));
    } else {
      setNavigator.setSearchOption(i18n.t(`SEARCH.${gurmukhiSearchText[0]}`));
    }
    setNavigator.setSelectedLanguage(event.target.value);
  };
  const handleSearchType = event => {
    setNavigator.setSearchOption(event.target.value);
  };
  console.log(navigator);
  return (
    <>
      <div className="language-selector">
        <label className="gurmukhi">
          <input
            type="radio"
            value="gr"
            id="gurmukhi-language"
            checked={navigator.selectedLanguage === 'gr'}
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
            checked={navigator.selectedLanguage === 'en'}
          />
          ABC
        </label>
      </div>
      <div className="search-type">
        {navigator.selectedLanguage === 'gr' ? (
          <select onChangeCapture={handleSearchType}>
            {gurmukhiSearchTypes.map(value => (
              <option key={value} value={value}>
                {i18n.t(`SEARCH.${gurmukhiSearchText[value]}`)}
              </option>
            ))}
          </select>
        ) : (
          <select onChangeCapture={handleSearchType}>
            {englishSearchTypes.map(value => (
              <option key={value} value={value}>
                {i18n.t(`SEARCH.${englishSearchText[value]}`)}
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}

export default SearchHeader;
