import React, { useEffect, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { remote } from 'electron';

function SearchHeader() {
  // For responsiveness
  const [width, setWidth] = useState(window.innerWidth);
  const breakpoint = 1308;
  useEffect(() => {
    window.addEventListener('resize', () => setWidth(window.innerWidth));
  }, []);
  // For constants
  const banidb = require('../../../common/constants/banidb');
  const { i18n } = remote.require('./app');
  const gurmukhiSearchText = banidb.GURMUKHI_SEARCH_TEXTS;
  const gurmukhiSearchTypes = Object.keys(gurmukhiSearchText);
  const englishSearchText = banidb.ENGLISH_SEARCH_TEXTS;
  const englishSearchTypes = Object.keys(englishSearchText);
  // For Global State
  const navigator = useStoreState(state => state.navigator);
  const setNavigator = useStoreActions(state => state.navigator);
  const handleLanguageChange = event => {
    if (event.target.value == 'en') {
      setNavigator.setSearchOption('3');
    } else {
      setNavigator.setSearchOption('0');
    }
    setNavigator.setSelectedLanguage(event.target.value);
  };
  const handleSearchType = event => {
    setNavigator.setSearchOption(event.target.value);
  };

  return (
    <>
      <div className="left-pane">
        <i className="fa fa-search" />
        <div className="language-selector">
          <label className="gurmukhi">
            <input
              type="radio"
              value="gr"
              id="gurmukhi-language"
              checked={navigator.selectedLanguage === 'gr'}
              onChange={handleLanguageChange}
            />
            gurmuKI
          </label>
          <label className="english">
            <input
              type="radio"
              value="en"
              id="english-language"
              onChange={handleLanguageChange}
              checked={navigator.selectedLanguage === 'en'}
            />
            English
          </label>
        </div>
      </div>
      <>
        {navigator.selectedLanguage === 'gr' ? (
          <>
            {width < breakpoint ? (
              <div className="search-select">
                <select onChangeCapture={handleSearchType}>
                  {gurmukhiSearchTypes.map(value => (
                    <option key={value} value={value}>
                      {i18n.t(`SEARCH.${gurmukhiSearchText[value]}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="search-type">
                {gurmukhiSearchTypes.map(value => (
                  <label key={value}>
                    <input type="checkbox" value={value} key={value} />
                    {i18n.t(`SEARCH.${gurmukhiSearchText[value]}`)}
                  </label>
                ))}
              </div>
            )}{' '}
          </>
        ) : (
          <>
            {width < breakpoint ? (
              <div className="search-select">
                <select onChangeCapture={handleSearchType}>
                  {englishSearchTypes.map(value => (
                    <option key={value} value={value}>
                      {i18n.t(`SEARCH.${englishSearchText[value]}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="search-type">
                {englishSearchTypes.map(value => (
                  <label key={value}>
                    <input type="checkbox" value={value} key={value} />
                    {i18n.t(`SEARCH.${englishSearchText[value]}`)}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </>
    </>
  );
}

export default SearchHeader;
