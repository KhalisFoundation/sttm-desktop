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
  const language = useStoreState(state => state.navigator);
  const setLanguage = useStoreActions(state => state.navigator);
  const handleLanguageChange = event => {
    if (event.target.value == 'en') {
      setLanguage.setSearchOption(englishSearchTypes[0]);
    } else {
      setLanguage.setSearchOption(gurmukhiSearchTypes[0]);
    }
    setLanguage.setDefaultLanguage(event.target.value);
  };
  const handleSearchType = event => {
    if (language.defaultLanguage === 'gr')
      setLanguage.setSearchOption(i18n.t(`SEARCH.${gurmukhiSearchText[event.target.value]}`));
    else setLanguage.setSearchOption(i18n.t(`SEARCH.${englishSearchText[event.target.value]}`));
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
