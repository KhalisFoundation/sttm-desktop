import React from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

const { i18n } = remote.require('./app');

const FilterDropdown = ({ title, onChange, optionsObj }) => {
  return (
    <>
      <select className="select-bani" onChange={onChange}>
        {Object.keys(optionsObj).map(keyName => (
          <option
            key={keyName}
            value={i18n.t(`SEARCH.${title.toUpperCase()}S.${optionsObj[keyName]}.VALUE`)}
          >
            {i18n.t(`SEARCH.${title.toUpperCase()}S.${optionsObj[keyName]}.TEXT`)}
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
  optionsObj: PropTypes.object,
};

export default FilterDropdown;
