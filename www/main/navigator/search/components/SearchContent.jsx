import React, { useState, useEffect } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import banidb from '../../../common/constants/banidb';
import { IconButton, InputBox, FilterDropdown, SearchResults } from '../../../common/sttm-ui';

function SearchContent() {
  const {
    currentLanguage,
    searchData,
    currentWriter,
    currentRaag,
    currentSource,
    verseHistory,
    isEmptySlide,
    isWaheguruSlide,
    activeShabadId,
    initialVerseId,
    activeVerseId,
  } = useStoreState(state => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setCurrentWriter,
    setCurrentRaag,
    setCurrentSource,
    setVerseHistory,
    setActiveVerseId,
    setIsEmptySlide,
    setIsWaheguruSlide,
  } = useStoreActions(state => state.navigator);

  const sourcesObj = banidb.SOURCE_TEXTS;
  const writersObj = banidb.WRITER_TEXTS;
  const raagsObj = banidb.RAAG_TEXTS;

  // Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
  };

  const changeActiveShabad = (newSelectedShabad, newSelectedVerse, newVerse = '') => {
    const check = verseHistory.filter(historyObj => historyObj.shabadId === newSelectedShabad);
    if (check.length === 0) {
      const updatedHistory = [
        ...verseHistory,
        {
          shabadId: newSelectedShabad,
          verseId: newSelectedVerse,
          label: newVerse,
          type: 'shabad',
          meta: {
            baniLength: '',
          },
          versesRead: [newSelectedVerse],
          continueFrom: newSelectedVerse,
          homeVerse: 0,
        },
      ];
      setVerseHistory(updatedHistory);
    }
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (activeShabadId !== newSelectedShabad) {
      setActiveShabadId(newSelectedShabad);
    }
    if (initialVerseId !== newSelectedVerse) {
      setInitialVerseId(newSelectedVerse);
    }
    if (activeVerseId !== newSelectedVerse) {
      setActiveVerseId(newSelectedVerse);
    }
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
  };

  const filters = allSearchedVerses => {
    let filteredResult = allSearchedVerses;
    if (currentWriter !== 'ALL') {
      filteredResult = allSearchedVerses.filter(verse => verse.writer.includes(currentWriter));
    }
    //  else if (currentWriter === 'ALL') {
    //   filteredResult = allSearchedVerses;
    // }
    if (currentRaag !== 'ALL') {
      filteredResult = filteredResult.filter(verse => verse.raag.includes(currentRaag));
    }
    //  else if (currentRaag === 'ALL') {
    //   filteredResult = allSearchedVerses;
    // }
    if (currentSource !== 'all') {
      filteredResult = filteredResult.filter(verse => verse.source.includes(currentSource));
    }
    //  else if (currentSource === 'all') {
    //   filteredResult = allSearchedVerses;
    // }
    return filteredResult;
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

  const [filteredShabads, setFilteredShabads] = useState([filters(mapVerseItems(searchData))]);

  useEffect(() => {
    setFilteredShabads(filters(mapVerseItems(searchData)));
  }, [searchData, currentWriter, currentRaag, currentSource]);

  return (
    <div>
      <div className="search-content">
        <InputBox
          placeholder={'Enter Search term here or ang number'}
          className={`${currentLanguage === 'gr' && 'gurmukhi'} mousetrap`}
        />
        <div className="input-buttons">
          <IconButton icon="fa fa-keyboard-o" onClick={HandleKeyboardToggle} />
        </div>
      </div>
      {/* <GurbaniKeyboard /> */}
      <div className="search-result-controls">
        <span>{filteredShabads.length ? `${filteredShabads.length} Results` : ''}</span>
        <div className="filters">
          <span>Filter by </span>
          <FilterDropdown
            title="Writer"
            onChange={event => setCurrentWriter(event.target.value)}
            optionsObj={writersObj}
          />
          <FilterDropdown
            title="Raag"
            onChange={event => setCurrentRaag(event.target.value)}
            optionsObj={raagsObj}
          />
          <FilterDropdown
            title="Source"
            onChange={event => setCurrentSource(event.target.value)}
            optionsObj={sourcesObj}
          />
        </div>
      </div>
      <div className="search-results">
        <div className="verse-block">
          <div className="result-list">
            <ul>
              {filteredShabads.map(
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
