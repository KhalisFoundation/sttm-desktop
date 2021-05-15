import React, { useState } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import banidb from '../../../common/constants/banidb';
import { IconButton, InputBox, FilterDropdown, SearchResultVerse } from '../../../common/sttm-ui';

function SearchContent() {
  const { selectedLanguage, searchedShabads } = useStoreState(state => state.navigator);
  const { setShabadSelected, setVerseSelected } = useStoreActions(state => state.navigator);

  const sourcesObj = banidb.SOURCE_TEXTS;
  const writersObj = banidb.WRITER_TEXTS;
  const raagsObj = banidb.RAAG_TEXTS;

  // Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    console.log(keyboardOpenStatus);
  };

  const changeActiveShabad = (newSelectedShabad, newSelectedVerse) => {
    setShabadSelected(newSelectedShabad);
    setVerseSelected(newSelectedVerse);
  };

  const filterRequiredVerseItems = searchedShabadsArray => {
    // console.log('searchedShabadsArray', searchedShabadsArray);
    return searchedShabadsArray
      ? searchedShabadsArray.map(verse => {
          return {
            ang: verse.PageNo,
            raag: verse.Raag ? verse.Raag.RaagEnglish : '',
            shabadId: verse.Shabads[0].ShabadID,
            source: verse.Source ? verse.Source.SourceEnglish : '',
            verse: verse.Gurmukhi,
            verseId: verse.ID,
            writer: verse.Writer ? verse.Writer.WriterEnglish : '',
          };
        })
      : [];
  };

  return (
    <div>
      <div className="search-content">
        <InputBox
          placeholder={'Enter Search term here or ang number'}
          className={`${selectedLanguage === 'gr' && 'gurmukhi'} mousetrap`}
        />
        <div className="input-buttons">
          <IconButton icon="fa fa-keyboard-o" onClick={HandleKeyboardToggle} />
        </div>
      </div>
      {/* <GurbaniKeyboard /> */}
      <div className="search-result-controls">
        <span>{searchedShabads.length ? `${searchedShabads.length} Results` : ''}</span>
        <div className="filters">
          <span>Filter by </span>
          <FilterDropdown
            title="Writer"
            onChange={event => console.log(event)}
            optionsObj={writersObj}
          />
          <FilterDropdown
            title="Raag"
            onChange={event => console.log(event)}
            optionsObj={raagsObj}
          />
          <FilterDropdown
            title="Source"
            onChange={event => console.log(event)}
            optionsObj={sourcesObj}
          />
        </div>
      </div>
      <div className="search-results">
        <SearchResultVerse
          verses={filterRequiredVerseItems(searchedShabads)}
          onClick={changeActiveShabad}
        />
      </div>
    </div>
  );
}

export default SearchContent;
