import React, { useEffect, useState } from 'react';
import IconButton from '../../utils/IconButton';
import InputBox from '../../utils/InputBox';
import { useStoreActions, useStoreState } from 'easy-peasy';
import SearchResults from './SearchResults';

function SearchContent() {
  const [searchVariables, setSearchVariables] = useState(null);
  const searchOption = useStoreState(state => state.navigator.searchOption);
  const baniSelected = useStoreState(state => state.navigator.selectedBani);
  const setBaniSelected = useStoreActions(state => state.navigator);
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    console.log(keyboardOpenStatus);
  };
  useEffect(() => {
    fetch('locales/en.json')
      .then(res => res.json())
      .then(data => {
        setSearchVariables(data.SEARCH),
          setBaniSelected.setSelectedBani(data.SEARCH.SOURCES.ALL_SOURCES);
      });
  }, []);
  const newSelection = event => {
    const value = event.target.value.split('-')[0];
    const label = event.target.value.split('-')[1];
    setBaniSelected.setSelectedBani(label);
  };
  return (
    <>
      <div className="search-content">
        <InputBox placeholder={searchOption} className="gurmukhi mousetrap" />
        <div className="input-buttons">
          <span>Ang</span>
          <input
            type="number"
            className="gurmukhi"
            placeholder="123"
            id="ang-input"
            min="1"
            max="1430"
          />
          <IconButton icon={'fa fa-keyboard-o'} onClick={HandleKeyboardToggle} />
        </div>
      </div>
      {/* <GurbaniKeyboard /> */}
      <div className="bani-selection">
        <select className="select-bani" onClickCapture={event => newSelection(event)}>
          {searchVariables &&
            Object.keys(searchVariables.SOURCES).map(source => (
              <option key={source} value={source + '-' + searchVariables.SOURCES[source]}>
                {searchVariables.SOURCES[source]}
              </option>
            ))}
        </select>
        <label>{baniSelected}</label>
      </div>
      <SearchResults />
    </>
  );
}

export default SearchContent;
