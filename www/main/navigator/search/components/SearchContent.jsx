import React, { useState } from 'react';
import { remote } from 'electron';
import { useStoreActions, useStoreState } from 'easy-peasy';
import IconButton from '../../../common/sttm-ui/iconbutton/IconButton';
import InputBox from '../../../common/sttm-ui/inputbox/InputBox';
import VersePanel from '../../../common/sttm-ui/versepanel/VersePanel';
import banidb from '../../../common/constants/banidb';

const { i18n } = remote.require('./app');

function SearchContent() {
  // const banidb = require('../../../common/constants/banidb');
  const { selectedLanguage, searchedShabads } = useStoreState(state => state.navigator);
  const { setSearchSource } = useStoreActions(state => state.navigator);
  // For Constants
  const verseSourcesText = banidb.SOURCE_TEXTS;
  const verseSourcesType = Object.keys(verseSourcesText);
  const verseWriterText = banidb.WRITER_TEXTS;
  const verseWriterType = Object.keys(verseWriterText);
  const verseRaagText = banidb.RAAG_TEXTS;
  const verseRaagType = Object.keys(verseRaagText);
  // Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    console.log(keyboardOpenStatus);
  };
  // For Filters
  // const [filterBySource, setFilterBySource] = useState([]);
  const [filterByRaag, setFilterByRaag] = useState([]);
  const [filterByWriter, setFilterByWriter] = useState([]);
  // const [verseArray, setVerseArray] = useState(searchedShabads);
  // Event Handlers
  const newWriterSelection = event => {
    if (event.target.value !== 'ALL') {
      setFilterByWriter([event.target.value]);
    } else {
      setFilterByWriter([]);
    }
  };
  const newSourceSelection = event => {
    setSearchSource(event.target.value);
  };
  const newRaagSelection = event => {
    if (event.target.value !== 'ALL') {
      setFilterByRaag([event.target.value]);
    } else {
      setFilterByRaag([]);
    }
  };

  // const filters = (verseArrayTemp, index, array) => {
  //   let Raag = true;
  //   let Source = true;
  //   let Writer = true;
  //   if (filterByRaag.length != 0) {
  //     Raag = filterByRaag.some(value => value == verseArrayTemp.raag);
  //   }
  //   if (filterBySource.length != 0) {
  //     Source = filterBySource.some(value => value == verseArrayTemp.source);
  //   }
  //   if (filterByWriter.length != 0) {
  //     Writer = filterByWriter.some(value => value == verseArrayTemp.writer);
  //   }
  //   return Writer && Raag && Source;
  // };

  const filterRequiredVerseItems = verses => {
    return verses.map(verse => {
      return {
        verseId: verse.ID,
        shabadId: verse.Shabads[0].ShabadID,
        verse: verse.Gurmukhi,
        ang: verse.PageNo,
        writer: verse.Writer ? verse.Writer.WriterEnglish : '',
        raag: verse.Raag ? verse.Raag.RaagEnglish : '',
        source: verse.Source ? verse.Source.SourceEnglish : '',
      };
    });
  };

  // For verses

  //  list   -> hrik item te true false return krna
  // raag -> abc ,source ->  bcd   > true , false
  // true = raag(hp) -> [abc, xyz].some(x => x == comingItem.raag) ,
  // false = source (>13000)->  [bcd,pqr ].some(x => comingItem.source)  > true , false
  // return raag(true) && source(false) && color(red)

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
          <select className="select-bani" onChange={event => newWriterSelection(event)}>
            {verseWriterType &&
              verseWriterType.map(value => (
                <option key={value} value={value}>
                  {i18n.t(`SEARCH.WRITERS.${verseWriterText[value]}`)}
                </option>
              ))}{' '}
          </select>
          <label>Writer</label>{' '}
          <select className="select-bani" onChange={event => newRaagSelection(event)}>
            {verseRaagType &&
              verseRaagType.map(value => (
                <option key={value} value={value}>
                  {i18n.t(`SEARCH.RAAGS.${verseRaagText[value]}`)}
                </option>
              ))}
          </select>
          <label>Raag</label>{' '}
          <select className="select-bani" onChange={event => newSourceSelection(event)}>
            {verseSourcesType &&
              verseSourcesType.map(value => (
                <option key={value} value={value}>
                  {i18n.t(`SEARCH.SOURCES.${verseSourcesText[value]}`)}
                </option>
              ))}
          </select>
          <label>Source</label>
        </div>
      </div>
      <div className="search-results">
        <VersePanel verses={filterRequiredVerseItems(searchedShabads)} SearchPane />
      </div>
    </div>
  );
}

export default SearchContent;
