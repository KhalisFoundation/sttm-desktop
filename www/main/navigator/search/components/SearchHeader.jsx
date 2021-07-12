import React, { useEffect, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { remote } from 'electron';
import banidb from '../../../common/constants/banidb';

function SearchHeader() {
  // For responsiveness
  const [width, setWidth] = useState(window.innerWidth);
  const breakpoint = 1308;
  const resizeFn = () => {
    setWidth(window.innerWidth);
  };

  useEffect(() => {
    window.addEventListener('resize', resizeFn);
    return () => {
      window.removeEventListener('resize', resizeFn);
    };
  }, []);

  const { i18n } = remote.require('./app');
  const gurmukhiSearchText = banidb.GURMUKHI_SEARCH_TEXTS;
  const gurmukhiSearchTypes = Object.keys(gurmukhiSearchText);
  const englishSearchText = banidb.ENGLISH_SEARCH_TEXTS;
  const englishSearchTypes = Object.keys(englishSearchText);

  const { currentLanguage, currentSearchType } = useStoreState(state => state.navigator);
  const { setCurrentSearchType, setCurrentLanguage } = useStoreActions(state => state.navigator);

  const handleLanguageChange = event => {
    if (event.target.value === 'en' && currentSearchType !== 3) {
      setCurrentSearchType(3);
    }
    if (event.target.value !== 'en' && currentSearchType !== 0) {
      setCurrentSearchType(0);
    }
    if (currentLanguage !== event.target.value) {
      setCurrentLanguage(event.target.value);
    }
  };
  const handleSearchType = event => {
    if (currentSearchType !== parseInt(event.target.value, 10)) {
      setCurrentSearchType(parseInt(event.target.value, 10));
    }
  };

  const handleSearchOption = event => {
    if (event.target.checked && currentSearchType !== parseInt(event.target.value, 10)) {
      setCurrentSearchType(parseInt(event.target.value, 10));
    }
  };

  return (
    <>
      <div className="left-pane">
        <i className="fa fa-search" />
        <div className="language-selector">
          <label className="gurmukhi language-btn-label">
            <span className="label-text">gurmuKI</span>
            <input
              type="radio"
              className="language-radio-btn"
              value="gr"
              id="gurmukhi-language"
              checked={currentLanguage === 'gr'}
              onChange={handleLanguageChange}
            />
            <span className="checkmark"></span>
          </label>
          <label className="english language-btn-label">
            <span className="label-text">English</span>
            <input
              type="radio"
              className="language-radio-btn"
              value="en"
              id="english-language"
              onChange={handleLanguageChange}
              checked={currentLanguage === 'en'}
            />
            <span className="checkmark"></span>
          </label>
        </div>
      </div>
      <>
        {currentLanguage === 'gr' ? (
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
                    <input
                      type="checkbox"
                      value={value}
                      key={value}
                      onChangeCapture={handleSearchOption}
                    />
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
