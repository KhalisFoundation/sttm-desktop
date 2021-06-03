import React from 'react';
import PropTypes from 'prop-types';

import { getKeyboardKeyValue, getMatraAkhar } from './utils';

import { defaultMatraValue, matras, withMatra, withoutMatra } from './constants';

export const GurmukhiKeyboard = ({ value, searchType, active, onKeyClick, onClose }) => {
  const defaultMatraKeys = Object.keys(defaultMatraValue);
  const isWithMatras = true;
  const keys = isWithMatras ? withMatra : withoutMatra;
  const keyboardGrid = [keys];

  const meta = <button> m </button>;
  const space = <button> </button>;

  const handleClick = () => {
    console.log('clicked');
  };

  return (
    <div className={`gurmukhi-keyboard gurmukhi ${active ? 'active' : ''}`} onClick={onKeyClick}>
      {keyboardGrid.map((rows, index) => {
        return (
          <div className="page" key={index} id={`gurmukhi-keyboard-page-${index + 1}`}>
            {rows.map((chars, rowIndex) => (
              <div key={`${index}-${rowIndex}`} className="keyboard-row">
                <div className="keyboard-row-set">
                  {chars.map((keyboardKey, i) => {
                    if (keyboardKey === 'meta') {
                      return meta;
                    }
                    if (keyboardKey === 'space') {
                      return space;
                    }

                    const isCurrentKeyDefaultMatraKey = defaultMatraKeys.includes(keyboardKey);

                    return (
                      <button
                        type="button"
                        key={i}
                        data-value={getKeyboardKeyValue(keyboardKey, value)}
                        className={isCurrentKeyDefaultMatraKey ? 'matra-button' : ''}
                        onClick={handleClick}
                      >
                        {isCurrentKeyDefaultMatraKey
                          ? getMatraAkhar(keyboardKey, value)
                          : keyboardKey}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

GurmukhiKeyboard.propTypes = {
  value: PropTypes.string,
  searchType: PropTypes.number,
  active: PropTypes.bool,
  onKeyClick: PropTypes.func,
  onClose: PropTypes.func,
};
