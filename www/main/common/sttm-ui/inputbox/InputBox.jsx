import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { searchShabads } from '../../../navigator/utils';

const InputBox = ({ placeholder, className }) => {
  const { currentSearchType, currentSource, searchQuery } = useStoreState(state => state.navigator);
  const { setSearchData, setSearchQuery } = useStoreActions(state => state.navigator);

  const handleChange = event => {
    setSearchQuery(event.target.value);
  };

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
