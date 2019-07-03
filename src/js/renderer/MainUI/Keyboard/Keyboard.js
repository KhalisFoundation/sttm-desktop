import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
// Config
import keyboardLayout from './keyboard.json';
// Actions
import {
  backspace,
  changeGurmukhiKBPage,
  toggleGurmukhiKBAction,
  typeChar,
} from '../../../shared/actions/keyboard';

export default () => {
  const { gurmukhiKB, search } = useSelector(state => state);
  const dispatch = useDispatch();

  // Handle clicking on keyboard buttons
  const clickKBButton = (action = false) => {
    // Change page
    if (action.includes('page')) {
      const page = parseInt(action.split('-')[1], 10);
      dispatch(changeGurmukhiKBPage(page));
    } else {
      switch (action) {
        // Backspace
        case 'bksp':
          dispatch(backspace(search.q));
          break;
        // Close keyboard
        case 'close':
          dispatch(toggleGurmukhiKBAction);
          break;
        // A normal character to be appended to current search query
        default:
          dispatch(typeChar(action, search.q));
          break;
      }
    }
  };
  return (
    <div id="gurmukhi-keyboard" className="gurmukhi">
      {keyboardLayout.map((page, pageIndex) => (
        <div
          id={`gurmukhi-keyboard-page-${pageIndex + 1}`}
          className={`page ${pageIndex + 1 === gurmukhiKB.page ? 'active' : ''}`}
        >
          {page.map(row => (
            <div className="keyboard-row">
              {row.map(rowSet => (
                <div className="keyboard-row-set">
                  {rowSet.map(button => {
                    if (typeof button === 'object') {
                      return (
                        <button type="button" onClick={() => clickKBButton(button.action)}>
                          {button.icon ? <i className={`fa ${button.icon}`} /> : button.char}
                        </button>
                      );
                    }
                    return (
                      <button type="button" onClick={() => clickKBButton(button)}>
                        {button}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
