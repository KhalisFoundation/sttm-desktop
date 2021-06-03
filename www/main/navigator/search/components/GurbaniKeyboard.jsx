import React from 'react';
import PropTypes from 'prop-types';
// import { Link } from 'react-router-dom';
// import ArrowIcon from './Icons/Arrow';

const GurbaniKeyboard = ({ onKeyClick, value, active, onClose }) => {
  const keyboardGrid = [
    [
      [['a', 'A', 'e', 's', 'h'], ['k', 'K', 'g', 'G', '|']],
      [['c', 'C', 'j', 'J', '\\'], ['t', 'T', 'f', 'F', 'x']],
      [['q', 'Q', 'd', 'D', 'n'], ['p', 'P', 'b', 'B', 'm']],
      [['X', 'r', 'l', 'v', 'V']],
    ],
    [
      [[1, 2, 3, 4, 5], [6, 7, 8, 9, 0]],
      [['w', 'i', 'I', 'u', 'U'], ['y', 'Y', 'o', 'O', 'M']],
      [['N', 'W', '`', '~', 'R'], ['H', '˜', '´', 'Í', 'Ï']],
      [['ç', 'E', '^', '\u00a0', '\u00a0']],
    ],
  ];

  return (
    <div
      className={`gurmukhi-keyboard gurmukhi ${active ? 'active' : ''}`}
      onClick={() => console.log('clicked')}
    >
      {keyboardGrid.map(
        (pages, index) =>
          true && (
            <div className="page" key={index} id={`gurmukhi-keyboard-page-${index + 1}`}>
              {pages.map((rows, rowIndex, { length }) => (
                <div key={`${index}-${rowIndex}`} className="keyboard-row">
                  <div className="keyboard-row-set">
                    {rows.map(row => {
                      return row.map(buttons => (
                        <button key={Math.random()} type="button" onClick={() => console.log()}>
                          {buttons}
                        </button>
                      ));
                    })}
                    {/* {console.log(second)} */}
                    {/* {first.map(buttonKey => (
                      <button key={Math.random()} type="button" onClick={() => console.log()}>
                        {buttonKey}
                      </button>
                    ))}
                    {second.map(buttonKey => (
                      <button key={Math.random()} type="button" onClick={() => console.log()}>
                        {buttonKey}
                      </button>
                    ))} */}
                    {/* {ButtonList(handleClick, first)} */}
                    {/* <ButtonList onButtonClick={handleClick} buttons={first} /> */}
                  </div>
                </div>
              ))}
            </div>
          ),
      )}
    </div>
  );
};

GurbaniKeyboard.propTypes = {
  value: PropTypes.string,
  onKeyClick: PropTypes.func,
  active: PropTypes.bool,
  onClose: PropTypes.func,
};

export default GurbaniKeyboard;
