import React, { useState } from 'react';
import IconButton from '../../utils/IconButton';
import InputBox from '../../utils/InputBox';
import { useStoreState } from 'easy-peasy';
import SearchResults from './SearchResults';
// import GurbaniKeyboard from '../../utils/GurbaniKeyboard';

function SearchContent() {
  const searchOption = useStoreState(state => state.navigator.searchOption);
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
  };
  const sources = {
    G: 'Guru Granth Sahib',
    D: 'Dasam Granth Sahib',
    B: 'Vaaran',
    N: 'Gazals',
    A: 'Amrit Keertan',
    S: 'Vaaran',
  };
  return (
    <>
      <div className="search-content">
        <InputBox placeholder={searchOption} />
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
      <div>
        <select className="select-bani">
          <option value="G">Guru Granth Sahib</option>
          <option value="D">Dasam Granth Sahib</option>
          <option value="B">Vaaran</option>
          <option value="N">Gazals</option>
          <option value="A">Amrit Keertan</option>
          <option value="S">Vaaran</option>
        </select>
      </div>
      <div>
        <SearchResults />
      </div>
    </>
  );
}

export default SearchContent;
