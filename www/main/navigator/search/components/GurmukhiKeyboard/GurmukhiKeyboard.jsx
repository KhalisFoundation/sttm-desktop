import React from 'react';
import PropTypes from 'prop-types';
import { getKeyboardKeyValue, getMatraAkhar } from './utils';
import { Arrow, Spacebar } from './icons';
import { defaultMatraValue, matras, withMatra, withoutMatra } from './constants';

export const GurmukhiKeyboard = ({ query, searchType, setQuery }) => {
  const defaultMatraKeys = Object.keys(defaultMatraValue);
  // If searchType is 2 searchOption is full word
  const isWithMatras = searchType === 2;
  const keys = isWithMatras ? withMatra : withoutMatra;
  const keyboardGrid = [keys];

  const handleClick = keyValue => {
    const lastChar = query.slice(-1);

    switch (keyValue) {
      case 'meta':
        if (query !== '') {
          setQuery(query.slice(0, -1));
        }
        break;

      case 'space':
        setQuery(`${query} `);
        break;

      default:
        // checks if matra could be applied to last character in searchQuery
        if (!matras.includes(lastChar) && keyValue.includes(lastChar) && keyValue !== lastChar) {
          setQuery(`${query.slice(0, -1)}${keyValue}`);
        } else {
          setQuery(query + keyValue);
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
                        data-value={getKeyboardKeyValue(keyboardKey, query)}
                        className={isCurrentKeyDefaultMatraKey ? 'matra-button' : ''}
                        onClick={() => handleClick(getKeyboardKeyValue(keyboardKey, query))}
                      >
                        {isCurrentKeyDefaultMatraKey
                          ? getMatraAkhar(keyboardKey, query)
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
  query: PropTypes.string,
  setQuery: PropTypes.func,
  searchType: PropTypes.number,
};
