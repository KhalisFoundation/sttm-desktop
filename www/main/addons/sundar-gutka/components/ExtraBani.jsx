import React from 'react';
import PropTypes from 'prop-types';
import anvaad from 'anvaad-js';
import { Tile } from '../../../common/sttm-ui';
import { convertToHyphenCase } from '../../../common/utils';

const ExtraBani = ({ title, banis = [], getBani, isEngTransliterated = false }) => {
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const groupHeaderClassName = `${hyphenedTitle}-heading`;
  const groupClassName = hyphenedTitle;
  const groupItemClassName = hyphenedTitle.slice(0, -1); // removes last character from string.

  return (
    <div className="bani-group-container">
      <header className={`bani-group-heading ${groupHeaderClassName}`}>{title}</header>
      <div className={`bani-group ${groupClassName}`}>
        {banis.map(({ id, name }) => (
          <Tile
            onClick={(e) => {
              getBani(e, id);
            }}
            key={name}
            type="extras"
            className={groupItemClassName}
            isEngTransliterated={isEngTransliterated}
          >
            {isEngTransliterated ? anvaad.translit(name) : name}
          </Tile>
        ))}
      </div>
    </div>
  );
};

ExtraBani.propTypes = {
  title: PropTypes.string,
  banis: PropTypes.array,
  getBani: PropTypes.func,
  isEngTransliterated: PropTypes.bool,
};

export default ExtraBani;
