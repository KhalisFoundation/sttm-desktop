import React, { useEffect, useState } from 'react';
import IconButton from '../../../common/sttm-ui/iconbutton/IconButton';
import InputBox from '../../../common/sttm-ui/inputbox/InputBox';
import { useStoreActions, useStoreState } from 'easy-peasy';
import VersePanel from '../../../common/sttm-ui/versepanel/VersePanel';
import { remote } from 'electron';

function SearchContent() {
  const banidb = require('../../../common/constants/banidb');
  const verseSourcesText = banidb.SOURCE_TEXTS;
  const verseSourcesType = Object.keys(verseSourcesText);
  const navigator = useStoreState(state => state.navigator);
  const baniSelected = useStoreState(state => state.navigator.selectedBani);
  const setBaniSelected = useStoreActions(state => state.navigator);
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const { i18n } = remote.require('./app');
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    console.log(keyboardOpenStatus);
  };
  const newSelection = event => {
    setBaniSelected.setSelectedBani(verseSourcesText[event.target.value]);
  };
  const activeVerse = () => {
    console.log('Search Pane clicked');
  };
  return (
    <>
      <div className="search-content">
        <InputBox
          placeholder={navigator.searchOption}
          className={`${navigator.selectedLanguage == 'gr' && 'gurmukhi'} mousetrap`}
        />
        <div className="input-buttons">
          <span>{i18n.t('SEARCH.ANG')}</span>
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
          {verseSourcesType &&
            verseSourcesType.map(value => (
              <option key={value} value={value}>
                {i18n.t(`SEARCH.SOURCES.${verseSourcesText[value]}`)}
              </option>
            ))}
        </select>
        <label>{i18n.t(`SEARCH.SOURCES.${baniSelected}`)}</label>
      </div>
      <VersePanel onClick={activeVerse} verse={navigator.verseSelected} />
    </>
  );
}

export default SearchContent;
