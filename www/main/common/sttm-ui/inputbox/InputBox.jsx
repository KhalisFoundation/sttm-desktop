import React, { useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { searchShabads, loadAng } from '../../../navigator/utils';
import { InputContext } from '../../../launchpad';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

const InputBox = ({ placeholder, disabled, className, databaseProgress, query, setQuery }) => {
  const { currentSearchType, currentSource, searchQuery, shortcuts } = useStoreState(
    (state) => state.navigator,
  );
  const { setSearchData, setShortcuts } = useStoreActions((state) => state.navigator);

  const inputContextRef = useContext(InputContext);
  const handleChange = (event) => {
    setQuery(event.target.value);
  };

  const handleSpace = (event) => {
    if (event.keyCode === 32 && [2, 3].includes(currentSearchType)) {
      setQuery(`${query} `);
    }
  };

  // keyboard shortcut to focus on search input
  const focusInputbox = () => {
    inputContextRef.current.focus();
  };

  const sendAnalytics = () => {
    analytics.trackEvent('search', currentSearchType, searchQuery);
  };

  useEffect(() => {
    if (shortcuts.focusInput) {
      focusInputbox();
      setQuery('');
      setShortcuts({
        ...shortcuts,
        focusInput: false,
      });
    }
  }, [shortcuts]);

  useEffect(() => {
    const searchTypeInt = parseInt(searchQuery, 10);
    const isAng = !!searchTypeInt;
    if (databaseProgress >= 1 && searchQuery) {
      if (isAng) {
        loadAng(searchTypeInt).then((rows) => setSearchData(rows));
      } else {
        searchShabads(searchQuery, currentSearchType, currentSource).then((rows) =>
          searchQuery ? setSearchData(rows) : setSearchData([]),
        );
      }
    }
  }, [searchQuery, currentSearchType, currentSource]);

  return (
    <>
      <input
        className={`input-box ${className}`}
        type="search"
        ref={inputContextRef}
        placeholder={placeholder}
        value={query}
        onBlur={sendAnalytics}
        onChange={handleChange}
        onKeyDown={handleSpace}
        disabled={disabled}
      />
    </>
  );
};

InputBox.propTypes = {
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  databaseProgress: PropTypes.number,
  query: PropTypes.string,
  setQuery: PropTypes.func,
};

export default InputBox;
