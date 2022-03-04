import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { searchShabads, loadAng } from '../../../navigator/utils';

const InputBox = ({ placeholder, disabled, className, databaseProgress }) => {
  const { currentSearchType, currentSource, searchQuery, shortcuts } = useStoreState(
    state => state.navigator,
  );
  const { setSearchData, setSearchQuery, setShortcuts } = useStoreActions(state => state.navigator);
  const [query, setQuery] = useState('');

  const inputRef = useRef(null);
  const handleChange = event => {
    setQuery(event.target.value);
  };

  const handleSpace = event => {
    if (event.keyCode === 32 && [2, 3].includes(currentSearchType)) {
      setQuery(`${query} `);
    }
  };

  // keyboard shortcut to focus on search input
  const focusInputbox = () => {
    inputRef.current.focus();
  };

  useEffect(() => {
    if (shortcuts.focusInput) {
      focusInputbox();
      setShortcuts({
        ...shortcuts,
        focusInput: false,
      });
    }
  }, [shortcuts]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query !== searchQuery) {
        setSearchQuery(query);
      }
    }, 50);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const searchTypeInt = parseInt(searchQuery, 10);
    const isAng = !!searchTypeInt;
    if (databaseProgress >= 1 && searchQuery) {
      if (isAng) {
        loadAng(searchTypeInt).then(rows => setSearchData(rows));
      } else {
        searchShabads(searchQuery, currentSearchType, currentSource).then(rows =>
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
        ref={inputRef}
        placeholder={placeholder}
        value={query}
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
};

export default InputBox;
