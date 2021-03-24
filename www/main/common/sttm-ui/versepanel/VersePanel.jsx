import { useStoreActions } from 'easy-peasy';
import { remote } from 'electron';
import React, { useState } from 'react';

function VersePanel({ ShabadPane, verses, HistoryPane, SearchPane }) {
  // Global States
  const setGlobalStates = useStoreActions(state => state.navigator);

  // States For Verses
  const [isActive, setActive] = useState(true);
  const [isHome, setHome] = useState([]);
  const [isRead, setIsRead] = useState([]);
  const [newHistory, setNewHistory] = useState([
    {
      verseId: '1',
      shabadId: '1',
      verse: ' swcw swihbu swcu  nwie BwiKAw Bwau Apwru ]',
      writer: 'verseWriterType',
      raag: 'verseRaagType',
      source: 'verseSourcesType',
    },
    {
      verseId: '2',
      shabadId: '2',
      verse: ' suixAY swsq isimRiq  vyd ]',
      writer: 'verseWriterType',
      raag: 'verseRaagType',
      source: 'verseSourcesType',
    },
    {
      verseId: '3',
      shabadId: '3',
      verse: ' suixAY squ sMqoKu  igAwnu ]',
      writer: 'verseWriterType',
      raag: 'verseRaagType',
      source: 'verseSourcesType',
    },
    {
      verseId: '4',
      shabadId: '4',
      verse: ' smuMd swh sulqwn  igrhw syqI mwlu Dnu ]',
      writer: 'verseWriterType',
      raag: 'verseRaagType',
      source: 'verseSourcesType',
    },
    {
      verseId: '5',
      shabadId: '5',
      verse: ' soeI soeI sdw scu swihbu ',
      writer: 'verseWriterType',
      raag: 'verseRaagType',
      source: 'verseSourcesType',
    },
  ]);
  const [shabadId, setShabadId] = useState(null);
  // Constants
  const banidb = require('../../../common/constants/banidb');
  const { i18n } = remote.require('./app');
  const verseSourcesText = banidb.SOURCE_TEXTS;
  const verseWriterText = banidb.WRITER_TEXTS;
  // Event Handlers

  const HandleHome = index => {
    setHome(index);
  };
  const activeVerse = verse => {
    setGlobalStates.setVerseSelected(verse.verseId);
    setGlobalStates.setShabadSelected(verse.shabadId);
    newHistory.push(verse.verseId);
    if (isRead.some(verseId => verseId == verse.verseId)) {
      console.log('exists');
    } else {
      isRead.push(verse.verseId);
    }
  };
  const DeleteItem = index => {
    setNewHistory(newHistory.filter(x => x.verseId != index));
    console.log('deleted item ', index);
  };
  return (
    <div className="verse-block">
      {verses ? (
        <div className="result-list">
          <ul>
            {verses.map((verse, index) => (
              <li
                key={verse.verseId}
                value={index}
                className={`${ShabadPane && 'shabadPane-list'}`}
                onClick={() => activeVerse(verse, index)}
              >
                <span className="shabadPane-controls">
                  {ShabadPane && (
                    <>
                      {isRead.map(isRead =>
                        isRead == verse.verseId ? (
                          <span key={isRead}>
                            <i className="fa fa-fw fa-check" />
                          </span>
                        ) : (
                          ''
                        ),
                      )}
                      {isHome != index ? (
                        <span onClick={() => HandleHome(index)}>
                          <i className="fa fa-home hoverIcon" />
                        </span>
                      ) : (
                        ''
                      )}
                      {isHome == index ? (
                        <span>
                          <i className="fa fa-fw fa-home" onClick={HandleHome} />
                        </span>
                      ) : (
                        ''
                      )}
                    </>
                  )}
                </span>
                <div className={`${SearchPane && 'search-list span-color'}`}>
                  <a className="panktee">
                    {SearchPane && <span className="span-color">Ang 683</span>}
                    <span className="gurmukhi"> {JSON.stringify(verse.verse)}</span>
                    {SearchPane && (
                      <div className={`${SearchPane && 'search-list-footer'}`}>
                        {i18n.t(`SEARCH.WRITERS.${verseWriterText[verse.writer]}`)},{' '}
                        {i18n.t(`SEARCH.SOURCES.${verseSourcesText[verse.source]}`)}
                      </div>
                    )}
                  </a>
                </div>
                <span className="historyPane-controls">
                  {HistoryPane && (
                    <i className="fa fa-times" onClick={() => DeleteItem(verse.verseId)} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        ''
      )}
    </div>
  );
}

export default VersePanel;
