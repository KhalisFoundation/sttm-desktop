import React, { useEffect, useState } from 'react';
import IconButton from '../../../common/sttm-ui/iconbutton/IconButton';
import InputBox from '../../../common/sttm-ui/inputbox/InputBox';
import { useStoreActions, useStoreState } from 'easy-peasy';
import VersePanel from '../../../common/sttm-ui/versepanel/VersePanel';
import { remote } from 'electron';

function SearchContent() {
  // For Constants
  const banidb = require('../../../common/constants/banidb');
  const { i18n } = remote.require('./app');
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
  const [filterBySource, setFilterBySource] = useState([]);
  const [filterByRaag, setFilterByRaag] = useState([]);
  const [filterByWriter, setFilterByWriter] = useState([]);

  //For Global State
  const navigator = useStoreState(state => state.navigator);
  const setGlobalStates = useStoreActions(state => state.navigator);
  // Event Handlers
  const newWriterSelection = event => {
    if (event.target.value != 'ALL') {
      setFilterByWriter([event.target.value]);
    } else {
      setFilterByWriter([]);
    }
  };
  const newSourceSelection = event => {
    if (event.target.value != 'all') {
      setFilterBySource([event.target.value]);
    } else {
      setFilterBySource([]);
    }
  };
  const newRaagSelection = event => {
    if (event.target.value != 'ALL') {
      setFilterByRaag([event.target.value]);
    } else {
      setFilterByRaag([]);
    }
  };

  const filters = (verseArray, index, array) => {
    let Raag = true;
    let Source = true;
    let Writer = true;
    if (filterByRaag.length != 0) {
      Raag = filterByRaag.some(value => value == verseArray.raag);
    }
    if (filterBySource.length != 0) {
      Source = filterBySource.some(value => value == verseArray.source);
    }
    if (filterByWriter.length != 0) {
      Writer = filterByWriter.some(value => value == verseArray.writer);
    }
    return Writer && Raag && Source;
  };

  useEffect(() => {
    console.log(filters(filterByWriter, filterBySource, filterByRaag));
    console.log(verseList);
    console.log(filterByWriter, filterBySource, filterByRaag);
    setVerseArray(verseList.filter(filters));
    console.log(verseList.filter(filters));
  }, [filterByWriter, filterBySource, filterByRaag]);
  // For verses

  //  list   -> hrik item te true false return krna
  // raag -> abc ,source ->  bcd   > true , false
  // true = raag(hp) -> [abc, xyz].some(x => x == comingItem.raag) ,
  //false = source (>13000)->  [bcd,pqr ].some(x => comingItem.source)  > true , false
  //return raag(true) && source(false) && color(red)

  let verseList = Object.freeze([
    {
      verseId: '1',
      shabadId: '1',
      verse: ' swcw swihbu swcu  nwie BwiKAw Bwau Apwru ]',
      writer: verseWriterType[1],
      raag: verseRaagType[2],
      source: verseSourcesType[5],
    },
    {
      verseId: '2',
      shabadId: '2',
      verse: ' suixAY swsq isimRiq  vyd ]',
      writer: verseWriterType[2],
      raag: verseRaagType[3],
      source: verseSourcesType[4],
    },
    {
      verseId: '3',
      shabadId: '3',
      verse: ' suixAY squ sMqoKu  igAwnu ]',
      writer: verseWriterType[3],
      raag: verseRaagType[4],
      source: verseSourcesType[3],
    },
    {
      verseId: '4',
      shabadId: '4',
      verse: ' smuMd swh sulqwn  igrhw syqI mwlu Dnu ]',
      writer: verseWriterType[4],
      raag: verseRaagType[5],
      source: verseSourcesType[2],
    },
    {
      verseId: '5',
      shabadId: '5',
      verse: ' soeI soeI sdw scu swihbu ',
      writer: verseWriterType[5],
      raag: verseRaagType[1],
      source: verseSourcesType[1],
    },
  ]);
  const [verseArray, setVerseArray] = useState(verseList);

  console.log(navigator);
  return (
    <div>
      <div className="search-content">
        <InputBox
          placeholder={'Enter Search term here or ang number'}
          className={`${navigator.selectedLanguage == 'gr' && 'gurmukhi'} mousetrap`}
        />
        <div className="input-buttons">
          <IconButton icon={'fa fa-keyboard-o'} onClick={HandleKeyboardToggle} />
        </div>
      </div>
      {/* <GurbaniKeyboard /> */}
      <div className="search-result-controls">
        <span>{verseArray.length} Results </span>
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
        <VersePanel verses={verseArray} SearchPane />
      </div>
    </div>
  );
}

export default SearchContent;
