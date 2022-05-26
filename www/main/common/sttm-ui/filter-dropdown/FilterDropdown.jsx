import React from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

const { i18n } = remote.require('./app');

const FilterDropdown = ({ title, onChange, optionsObj }) => {
  const isSource = title === 'Source';

  return (
    <>
      <select className="select-bani" onChange={onChange}>
        {Object.keys(optionsObj).map(keyName => (
          <option
            key={keyName}
            value={
              isSource
                ? keyName
                : i18n.t(`SEARCH.${title.toUpperCase()}S.${optionsObj[keyName]}.VALUE`)
            }
          >
            {isSource
              ? i18n.t(`SEARCH.${title.toUpperCase()}S.${optionsObj[keyName]}.TEXT`)
              : i18n.t(`SEARCH.${title.toUpperCase()}S.${optionsObj[keyName]}.VALUE`)}
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
