import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { searchShabads } from '../../../navigator/utils';

const InputBox = ({ placeholder, className }) => {
  const { searchOption, searchSource } = useStoreState(state => state.navigator);
  const { setSearchedShabads } = useStoreActions(state => state.navigator);
  const [searchQuery, setSearchQuery] = useState('');
  const handleChange = event => {
    setSearchQuery(event.target.value);
  };

  useEffect(() => {
    searchShabads(searchQuery, searchOption, searchSource).then(rows =>
      searchQuery ? setSearchedShabads(rows) : setSearchedShabads([]),
    );
  }, [searchQuery, searchOption, searchSource]);

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
