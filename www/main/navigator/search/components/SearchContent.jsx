import React, { useState, useEffect } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { remote, ipcRenderer } from 'electron';
import banidb from '../../../common/constants/banidb';
import { filters } from '../../utils';
import {
  IconButton,
  InputBox,
  FilterDropdown,
  SearchResults,
  FilterTag,
} from '../../../common/sttm-ui';
import { GurmukhiKeyboard } from './GurmukhiKeyboard';
import { useNewShabad } from '../hooks/use-new-shabad';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const SearchContent = () => {
  const changeActiveShabad = useNewShabad();

  const {
    currentLanguage,
    searchData,
    currentWriter,
    currentRaag,
    currentSource,
    searchQuery,
    currentSearchType,
    shortcuts,
    searchShabadsCount,
  } = useStoreState(state => state.navigator);
  const {
    setCurrentWriter,
    setCurrentRaag,
    setCurrentSource,
    setSearchQuery,
    setShortcuts,
    setSearchShabadsCount,
  } = useStoreActions(state => state.navigator);

  // Local State
  const [databaseProgress, setDatabaseProgress] = useState(1);
  const [query, setQuery] = useState('');

  const sourcesObj = banidb.SOURCE_TEXTS;
  const writersObj = banidb.WRITER_TEXTS;
  const raagsObj = banidb.RAAG_TEXTS;
  const allWriterText = i18n.t(`SEARCH.WRITERS.ALL_WRITERS.VALUE`);
  const allRaagText = i18n.t(`SEARCH.RAAGS.ALL_RAAGS.VALUE`);
  const allSourceText = i18n.t(`SEARCH.SOURCES.ALL_SOURCES.VALUE`);

  const isShowFiltersTag =
    currentWriter !== allWriterText ||
    currentRaag !== allRaagText ||
    currentSource !== allSourceText;
  // Gurmukhi Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    analytics.trackEvent('search', 'gurmukhi-keyboard-open', keyboardOpenStatus);
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

  const openFirstResult = () => {
    if (searchQuery.length > 0 && filteredShabads.length > 0) {
      // Takes { shabadId, verseId, verse } from the first shabad in search result
      const { shabadId, verseId } = filteredShabads[0];
      changeActiveShabad(shabadId, verseId);
    }
  };

  const getPlaceholder = () => {
    if (databaseProgress < 1) {
      return i18n.t('DATABASE.DOWNLOADING');
    }
    if (currentSearchType === 3) {
      return i18n.t('SEARCH.PLACEHOLDER_ENGLISH');
    }
    return i18n.t('SEARCH.PLACEHOLDER_GURMUKHI');
  };

  useEffect(() => {
    setFilteredShabads(
      filters(mapVerseItems(searchData), currentWriter, currentRaag, currentSource),
    );
  }, [searchData, currentWriter, currentRaag, currentSource]);

  // checks if keyboard shortcut is fired then it invokes the function
  useEffect(() => {
    if (shortcuts.openFirstResult) {
      openFirstResult();
      setShortcuts({
        ...shortcuts,
        openFirstResult: false,
      });
    }
  }, [shortcuts]);

  useEffect(() => {
    if (searchQuery.length === 0) {
      setFilteredShabads([]);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (searchShabadsCount !== filteredShabads.length) {
      setSearchShabadsCount(filteredShabads.length);
    }
  }, [filteredShabads]);

  ipcRenderer.on('database-progress', data => {
    setDatabaseProgress(data.percent);
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query !== searchQuery) {
        setSearchQuery(query);
      }
    }, 50);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  return (
    <div className="search-content-container">
      <div className="search-content">
        <InputBox
          placeholder={getPlaceholder()}
          disabled={databaseProgress < 1}
          className={`${currentLanguage === 'gr' && 'gurmukhi'} mousetrap`}
          databaseProgress={databaseProgress}
          query={query}
          setQuery={setQuery}
        />
        {currentLanguage !== 'en' && (
          <div className="input-buttons">
            <IconButton icon="fa fa-keyboard-o" onClick={HandleKeyboardToggle} />
          </div>
        )}
      </div>
      <div id="search-bg">
        <div
          id="db-download-progress"
          style={{
            width: `${databaseProgress * 100}%`,
            height: databaseProgress < 1 ? '2px' : '0px',
          }}
        ></div>
      </div>
      {keyboardOpenStatus && currentLanguage !== 'en' && (
        <GurmukhiKeyboard searchType={currentSearchType} query={query} setQuery={setQuery} />
      )}
      <div className="search-result-controls">
        {isShowFiltersTag && (
          <div className="filter-tag--container">
            {currentWriter !== allWriterText && (
              <FilterTag
                close={() => setCurrentWriter(allWriterText)}
                title={currentWriter}
                filterType={i18n.t('SEARCH.WRITER')}
              />
            )}
            {currentRaag !== allRaagText && (
              <FilterTag
                close={() => setCurrentRaag(allRaagText)}
                title={currentRaag}
                filterType={i18n.t('SEARCH.RAAG')}
              />
            )}
            {currentSource !== allSourceText && (
              <FilterTag
                close={() => setCurrentSource(allSourceText)}
                title={i18n.t(`SEARCH.SOURCES.${sourcesObj[currentSource]}.TEXT`)}
                filterType={i18n.t('SEARCH.SOURCE')}
              />
            )}
          </div>
        )}
        <div className="filters">
          <span>Filter by </span>
          <FilterDropdown
            title="Writer"
            onChange={event => {
              setCurrentWriter(event.target.value);
              analytics.trackEvent('search', 'searchWriter', event.target.value);
            }}
            optionsObj={writersObj}
            currentValue={currentWriter}
          />
          <FilterDropdown
            title="Raag"
            onChange={event => {
              setCurrentRaag(event.target.value);
              analytics.trackEvent('search', 'searchRaag', event.target.value);
            }}
            optionsObj={raagsObj}
            currentValue={currentRaag}
          />
          <FilterDropdown
            title="Source"
            onChange={event => {
              setCurrentSource(event.target.value);
              analytics.trackEvent('search', 'searchSource', event.target.value);
            }}
            optionsObj={sourcesObj}
            currentValue={currentSource}
          />
        </div>
      </div>
      <div className="search-results">
        <div className="verse-block">
          {filteredShabads.map(
            ({ ang, shabadId, sourceId, verse, verseId, writer, raag }, index) => (
              <SearchResults
                key={index}
                ang={ang}
                searchType={currentSearchType}
                onClick={changeActiveShabad}
                shabadId={shabadId}
                raag={raag}
                sourceId={sourceId}
                searchQuery={searchQuery}
                verse={verse}
                verseId={verseId}
                writer={writer}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchContent;
