import React from 'react';
import PropTypes from 'prop-types';

const FilterDropdown = ({ title, onChange, currentValue, optionsArray }) => {
  return (
    <>
      <select className="select-bani" onChange={onChange} value={currentValue}>
        {optionsArray.length &&
          optionsArray.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
      </select>
      <span>{title}</span>
    </>
  );
};

FilterDropdown.propTypes = {
  title: PropTypes.string,
  onChange: PropTypes.func,
  optionsArray: PropTypes.array,
  currentValue: PropTypes.string,
};

export default FilterDropdown;
