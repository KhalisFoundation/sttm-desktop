import React from 'react';
import PropTypes from 'prop-types';

import { Tile } from '../../../../sttm-ui';
import { convertToHyphenCase } from '../../../../utils';

const ExtraBani = ({ title, banis = [] }) => {
  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const groupHeaderClassName = `${hyphenedTitle}-heading`;
  const groupClassName = hyphenedTitle;
  const groupItemClassName = hyphenedTitle.slice(0, -1); // removes last character from string.

  return (
    <div className="bani-group-container">
      <header className={`bani-group-heading ${groupHeaderClassName}`}>{title}</header>
      <div className={`bani-group ${groupClassName}`}>
        {banis.map(b => (
          <Tile key={b.name} type="extras" className={groupItemClassName}>
            {b.name}
          </Tile>
        ))}
      </div>
    </div>
  );
};

ExtraBani.propTypes = {
  title: PropTypes.string,
  baanis: PropTypes.arrayOf({
    name: PropTypes.string.isRequired,
  }),
};

export default ExtraBani;
