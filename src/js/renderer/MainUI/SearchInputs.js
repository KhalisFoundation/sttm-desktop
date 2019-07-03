import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import onClickOutside from 'react-onclickoutside';
// Custom components
import Keyboard from './Keyboard/Keyboard';
// Actions
import { toggleGurmukhiKBAction } from '../../shared/actions/keyboard';
import { searchAction } from '../../shared/actions/search';
import { updateSearchFocusStatusAction } from '../../shared/actions/rendererState';

const SearchInputs = () => {
  const [searchInput, setSearchInput] = useState('');
  const dispatch = useDispatch();
  const { rendererState, gurmukhiKB, search } = useSelector(state => state);
  let newSearchTimeout;

  // When clicking outside <SearchInputs /> and its children, we should close the GurmukhiKB
  SearchInputs.onClickOutside = () => dispatch(updateSearchFocusStatusAction(false));

  const sendSearch = val => {
    // Don't search if there is less than a 100ms gap in between key presses
    clearTimeout(newSearchTimeout);
    newSearchTimeout = setTimeout(() => dispatch(searchAction(val)), 100);
  };

  const handleChange = e => {
    setSearchInput(e.target.value);
    sendSearch(e.target.value);
  };

  // Update the search field if a new value was sent via the GurmukhiKB
  if (rendererState.typingWithKB && search.q !== searchInput) {
    setSearchInput(search.q);
  }

  return (
    <div>
      <div id="search-container">
        <input
          id="search"
          className="gurmukhi"
          type="search"
          onFocus={() => dispatch(updateSearchFocusStatusAction(true))}
          onChange={handleChange}
          // Update the value if input was from Gurmukhi KB
          value={searchInput}
        />
        <span>Ang</span>
        <input
          id="ang-input"
          className="gurmukhi"
          type="number"
          placeholder="123"
          min="1"
          max="1430"
          onFocus={() => dispatch(updateSearchFocusStatusAction(true))}
          onKeyUp={e => search(e.target.value)}
        />
        <button
          id="gurmukhi-keyboard-toggle"
          type="button"
          onClick={() => {
            if (!rendererState.searchFocus && gurmukhiKB.open) {
              dispatch(updateSearchFocusStatusAction(true));
            } else {
              dispatch(toggleGurmukhiKBAction);
            }
          }}
        >
          <i className="fa fa-keyboard-o" />
        </button>
      </div>
      <div id="search-bg">
        <div id="db-download-progress" />
      </div>
      <Keyboard />
    </div>
  );
};

const clickOutsideConfig = {
  handleClickOutside: () => SearchInputs.onClickOutside,
};

export default onClickOutside(SearchInputs, clickOutsideConfig);

/* const searchInputs = h('div#search-container', [
  h('input#search.gurmukhi', {
    disabled: 'disabled',
    type: 'search',
  }),
  h('input#ang-input.gurmukhi', {
    type: 'number',
    disabled: 'disabled',
    oninput: e => module.exports.searchByAng(e),
  }),
]); */
