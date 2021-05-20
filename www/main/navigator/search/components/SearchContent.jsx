import React, { useState } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import banidb from '../../../common/constants/banidb';
import { IconButton, InputBox, FilterDropdown, SearchResults } from '../../../common/sttm-ui';

function SearchContent() {
  const { selectedLanguage, searchedShabads, versesHistory } = useStoreState(
    state => state.navigator,
  );
  const {
    setShabadSelected,
    setVerseSelected,
    setSearchWriter,
    setSearchRaag,
    setSearchSource,
    setVersesHistory,
  } = useStoreActions(state => state.navigator);

  const sourcesObj = banidb.SOURCE_TEXTS;
  const writersObj = banidb.WRITER_TEXTS;
  const raagsObj = banidb.RAAG_TEXTS;

  // Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    // console.log(keyboardOpenStatus);
  };

  const changeActiveShabad = (newSelectedShabad, newSelectedVerse, newVerse = '') => {
    const check = versesHistory.filter(historyObj => historyObj.shabadId === newSelectedShabad);
    if (check.length === 0) {
      const updatedHistory = versesHistory;
      updatedHistory.push({
        shabadId: newSelectedShabad,
        verseId: newSelectedVerse,
        label: newVerse,
        type: 'shabad',
        meta: {
          baniLength: '',
        },
        versesRead: [newSelectedVerse],
        continueFrom: newSelectedVerse,
      });
      setVersesHistory(updatedHistory);
    }
    setShabadSelected(newSelectedShabad);
    setVerseSelected(newSelectedVerse);
  };

  const mapVerseItems = searchedShabadsArray => {
    return searchedShabadsArray
      ? searchedShabadsArray.map(verse => {
          return {
            ang: verse.PageNo,
            raag: verse.Raag ? verse.Raag.RaagEnglish : '',
            shabadId: verse.Shabads[0].ShabadID,
            source: verse.Source ? verse.Source.SourceEnglish : '',
            sourceId: verse.Source ? verse.Source.SourceID : '',
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
            onChange={event => setSearchWriter(event.target.value)}
            optionsObj={writersObj}
          />
          <FilterDropdown
            title="Raag"
            onChange={event => setSearchRaag(event.target.value)}
            optionsObj={raagsObj}
          />
          <FilterDropdown
            title="Source"
            onChange={event => setSearchSource(event.target.value)}
            optionsObj={sourcesObj}
          />
        </div>
      </div>
      <div className="search-results">
        <div className="verse-block">
          <div className="result-list">
            <ul>
              {mapVerseItems(searchedShabads).map(
                ({ ang, shabadId, source, sourceId, verse, verseId, writer }) => (
                  <SearchResults
                    key={verseId}
                    ang={ang}
                    onClick={changeActiveShabad}
                    shabadId={shabadId}
                    source={source}
                    sourceId={sourceId}
                    verse={verse}
                    verseId={verseId}
                    writer={writer}
                  />
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchContent;
