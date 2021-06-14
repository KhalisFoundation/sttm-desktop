import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { Tile } from '../../../common/sttm-ui';
import { convertToHyphenCase } from '../../../common/utils';

const ExtraBani = ({ title, banis = [], onScreenClose }) => {
  const { isSundarGutkaBani, sundarGutkaBaniId, isCeremonyBani } = useStoreState(
    state => state.navigator,
  );
  const { setIsSundarGutkaBani, setSundarGutkaBaniId, setIsCeremonyBani } = useStoreActions(
    state => state.navigator,
  );

  const hyphenedTitle = convertToHyphenCase(title.toLowerCase());
  const groupHeaderClassName = `${hyphenedTitle}-heading`;
  const groupClassName = hyphenedTitle;
  const groupItemClassName = hyphenedTitle.slice(0, -1); // removes last character from string.

  const loadBani = baniId => {
    if (isCeremonyBani) {
      setIsCeremonyBani(false);
    }

    if (!isSundarGutkaBani) {
      setIsSundarGutkaBani(true);
    }

    if (sundarGutkaBaniId !== baniId) {
      setSundarGutkaBaniId(baniId);
    }
    onScreenClose();
  };

  return (
    <div className="bani-group-container">
      <header className={`bani-group-heading ${groupHeaderClassName}`}>{title}</header>
      <div className={`bani-group ${groupClassName}`}>
        {banis.map(b => (
          <Tile
            onClick={() => loadBani(b.id)}
            key={b.name}
            type="extras"
            className={groupItemClassName}
          >
            {b.name}
          </Tile>
        ))}
      </div>
    </div>
  );
};

ExtraBani.propTypes = {
  title: PropTypes.string,
  onScreenClose: PropTypes.func,
  banis: PropTypes.array,
};

export default ExtraBani;
