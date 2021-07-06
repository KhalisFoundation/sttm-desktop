import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { searchShabads } from '../../../navigator/utils';

const InputBox = ({ placeholder, className }) => {
  const { currentSearchType, currentSource, searchQuery, shortcuts } = useStoreState(
    state => state.navigator,
  );
  const { setSearchData, setSearchQuery, setShortcuts } = useStoreActions(state => state.navigator);

  const inputRef = useRef(null);
  const handleChange = event => {
    setSearchQuery(event.target.value);
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
    searchShabads(searchQuery, currentSearchType, currentSource).then(rows =>
      searchQuery ? setSearchData(rows) : setSearchData([]),
    );
  }, [searchQuery, currentSearchType]);

  return (
    <>
      <input
        className={`input-box ${className}`}
        type="search"
        ref={inputRef}
        placeholder={placeholder}
        value={searchQuery}
        onChange={handleChange}
      />
    </>
  );
};

InputBox.propTypes = {
  placeholder: PropTypes.string,
  className: PropTypes.string,
};

export default InputBox;
