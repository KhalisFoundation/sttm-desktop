import React from 'react';
import PropTypes from 'prop-types';
import { getKeyboardKeyValue, getMatraAkhar } from './utils';
import { Arrow, Spacebar } from './icons';
import { defaultMatraValue, matras, withMatra, withoutMatra } from './constants';

export const GurmukhiKeyboard = ({ value, searchType, setValue }) => {
  const defaultMatraKeys = Object.keys(defaultMatraValue);
  // If searchType is 2 searchOption is full word
  const isWithMatras = searchType === 2;
  const keys = isWithMatras ? withMatra : withoutMatra;
  const keyboardGrid = [keys];

  const handleClick = keyValue => {
    const lastChar = value.slice(-1);

    switch (keyValue) {
      case 'meta':
        if (value !== '') {
          setValue(value.slice(0, -1));
        }
        break;

      case 'space':
        setValue(`${value} `);
        break;

      default:
        // checks if matra could be applied to last character in searchQuery
        if (!matras.includes(lastChar) && keyValue.includes(lastChar) && keyValue !== lastChar) {
          setValue(`${value.slice(0, -1)}${keyValue}`);
        } else {
          setValue(value + keyValue);
        }
        break;
    }
  };

  return (
    <div className="gurmukhi-keyboard gurmukhi">
      {keyboardGrid.map((rows, index) => {
        return (
          <div className="page" key={index} id={`gurmukhi-keyboard-page-${index + 1}`}>
            {rows.map((chars, rowIndex) => (
              <div key={`${index}-${rowIndex}`} className="keyboard-row">
                <div className="keyboard-row-set">
                  {chars.map((keyboardKey, i) => {
                    if (keyboardKey === 'meta') {
                      return (
                        <button key={keyboardKey} onClick={() => handleClick('meta')}>
                          <Arrow />
                        </button>
                      );
                    }

                    if (keyboardKey === 'space') {
                      return (
                        <button key={keyboardKey} onClick={() => handleClick('space')}>
                          <Spacebar />‎
                        </button>
                      );
                    }

                    const isCurrentKeyDefaultMatraKey = defaultMatraKeys.includes(keyboardKey);

                    return (
                      <button
                        type="button"
                        key={i}
                        data-value={getKeyboardKeyValue(keyboardKey, value)}
                        className={isCurrentKeyDefaultMatraKey ? 'matra-button' : ''}
                        onClick={() => handleClick(getKeyboardKeyValue(keyboardKey, value))}
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
  setValue: PropTypes.func,
  searchType: PropTypes.number,
};
