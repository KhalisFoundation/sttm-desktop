import React, { useState, useEffect, useCallback } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';
import { Virtuoso } from 'react-virtuoso';
import isOnline from 'is-online';
import { unicode } from 'anvaad-js';

import banidb from '../../../common/constants/banidb';
import { filters, searchShabads } from '../../utils';
import { formatDuration, retrieveFilterOption } from '../utils';

import { classNames } from '../../../common/utils';
import {
  IconButton,
  InputBox,
  FilterDropdown,
  SearchResults,
  FilterTag,
  VoiceWave,
} from '../../../common/sttm-ui';
import { GurmukhiKeyboard } from './GurmukhiKeyboard';
import { useNewShabad } from '../hooks/use-new-shabad';

const remote = require('@electron/remote');
const prodConfig = require('../../../../../config.prod.json');

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
  } = useStoreState((state) => state.navigator);
  const {
    setCurrentWriter,
    setCurrentRaag,
    setCurrentSource,
    setSearchQuery,
    setShortcuts,
    setSearchShabadsCount,
    setSearchData,
    setCurrentSearchType,
    setCurrentLanguage,
  } = useStoreActions((state) => state.navigator);

  // Local State
  const [databaseProgress, setDatabaseProgress] = useState(1);
  const [query, setQuery] = useState('');
  const [writerArray, setWriterArray] = useState([]);
  const [raagArray, setRaagArray] = useState([]);
  const [sourceArray, setSourceArray] = useState([]);
  const [searchResultsCount, setSearchResultsCount] = useState(40);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  const sourcesObj = banidb.SOURCE_TEXTS;
  const writersObj = banidb.WRITER_TEXTS;
  const raagsObj = banidb.RAAG_TEXTS;

  const isShowFiltersTag =
    currentWriter !== 'all' || currentRaag !== 'all' || currentSource !== 'all';
  // Gurmukhi Keyboard
  const [keyboardOpenStatus, setKeyboardOpenStatus] = useState(false);
  const HandleKeyboardToggle = () => {
    setKeyboardOpenStatus(!keyboardOpenStatus);
    analytics.trackEvent({
      category: 'search',
      action: 'gurmukhi-keyboard-open',
      value: keyboardOpenStatus ? 'open' : 'close',
    });
  };

  const loadMoreSearchResults = useCallback(() => {
    setTimeout(() => {
      setSearchResultsCount(searchResultsCount + 20);
      searchShabads(query, currentSearchType, currentSource, searchResultsCount).then(
        (rows) => query && rows.length && setSearchData(rows),
      );
      analytics.trackEvent({
        category: 'search',
        action: 'load-more-search-results',
        value: searchResultsCount,
      });
    }, 200);
  });
  const mapVerseItems = (searchedShabadsArray) =>
    searchedShabadsArray
      ? searchedShabadsArray.map((verse) => ({
          ang: verse.PageNo,
          raag: verse.Raag ? verse.Raag.RaagEnglish : '',
          shabadId: verse.Shabads[0].ShabadID,
          source: verse.Source ? verse.Source.SourceEnglish : '',
          sourceId: verse.Source ? verse.Source.SourceID : '',
          verse: verse.Gurmukhi,
          verseId: verse.ID,
          writer: verse.Writer ? verse.Writer.WriterEnglish : '',
        }))
      : [];

  const [filteredShabads, setFilteredShabads] = useState([]);

  const openFirstResult = () => {
    if (searchQuery.length > 0 && filteredShabads.length > 0) {
      // Takes { shabadId, verseId, verse } from the first shabad in search result
      const { shabadId, verseId, verse } = filteredShabads[0];
      changeActiveShabad(shabadId, verseId, verse);
    }
    analytics.trackEvent({
      category: 'search',
      action: 'open-first-result',
      value: searchQuery,
    });
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
      filters(mapVerseItems(searchData), currentWriter, currentRaag, writerArray, raagArray),
    );
  }, [searchData, currentWriter, currentRaag]);

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

  ipcRenderer.on('database-progress', (data) => {
    const { percent } = JSON.parse(data);
    setDatabaseProgress(percent);
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query !== searchQuery) {
        setSearchQuery(query);
        setSearchResultsCount(40);
      }
    }, 50);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const wData = retrieveFilterOption(writersObj, 'writer');
    wData.then((d) => {
      setWriterArray(d);
    });
    const rData = retrieveFilterOption(raagsObj, 'raag');
    rData.then((d) => {
      setRaagArray(d);
    });
    const sData = retrieveFilterOption(sourcesObj, 'source');
    sData.then((d) => {
      setSourceArray(d);
    });
  }, []);

  useEffect(() => {
    const checkOnlineStatus = async () => {
      try {
        const onlineValue = await isOnline();
        setIsConnected(onlineValue);
      } catch (error) {
        setIsConnected(false);
      }
    };

    checkOnlineStatus();
  }, []);

  const handleMicClick = async () => {
    if (isRecording) {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      setIsRecording(false);
      setRecordingDuration(0);
      analytics.trackEvent({
        category: 'search',
        action: 'voice-search',
        label: 'stop-recording',
      });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];

        recorder.ondataavailable = (e) => {
          chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: 'audio/wav' });
          const reader = new FileReader();

          reader.onload = async () => {
            const base64Audio = reader.result.toString().split(',')[1];

            try {
              const response = await fetch(prodConfig.AUDIO_TRANSCRIPT_API, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  audioData: base64Audio,
                  apiKey: prodConfig.AUDIO_TRANSCRIPT_API_KEY,
                }),
              });

              const data = await response.json();

              if (data.status === 'success') {
                console.log('Transcript Initials:', data.transcriptInitials);
                const decodedText = unicode(data.transcriptInitials, true);
                if (currentSearchType !== 1) {
                  setCurrentSearchType(1);
                }
                if (currentLanguage !== 'gr') {
                  setCurrentLanguage('gr');
                }
                setQuery(decodedText);
                analytics.trackEvent({
                  category: 'search',
                  action: 'voice-search',
                  label: 'transcript-success',
                  value: data.transcriptInitials,
                });
              } else {
                console.error('Error:', data.message);
                analytics.trackEvent({
                  category: 'search',
                  action: 'voice-search',
                  label: 'transcript-error',
                  value: data.message,
                });
              }
            } catch (error) {
              console.error('Network Error:', error.message);
              analytics.trackEvent({
                category: 'search',
                action: 'voice-search',
                label: 'network-error',
                value: error.message,
              });
            }
          };

          reader.readAsDataURL(audioBlob);

          stream.getTracks().forEach((track) => track.stop());
        };

        setMediaRecorder(recorder);
        recorder.start();
        setIsRecording(true);
        setRecordingDuration(0);

        analytics.trackEvent({
          category: 'search',
          action: 'voice-search',
          label: 'start-recording',
        });
      } catch (error) {
        console.error('Error accessing microphone:', error);
        analytics.trackEvent({
          category: 'search',
          action: 'voice-search',
          label: 'microphone-error',
          value: error.message,
        });
        // Show user-friendly error message
        alert('Unable to access microphone. Please check permissions and try again.');
      }
    }
  };

  // Timer for recording duration
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  return (
    <div className="search-content-container">
      <div className="search-content">
        {isRecording ? (
          <div className="voice-wave-container">
            <div className="recording-duration">{formatDuration(recordingDuration)}</div>
            <VoiceWave />
          </div>
        ) : (
          <InputBox
            placeholder={getPlaceholder()}
            disabled={databaseProgress < 1}
            className={`${currentLanguage === 'gr' ? 'gurmukhi' : 'english'} mousetrap`}
            databaseProgress={databaseProgress}
            query={query}
            setQuery={setQuery}
          />
        )}
        <div className="input-buttons">
          {isConnected && (
            <IconButton
              icon={isRecording ? 'fa fa-stop' : 'fa fa-microphone'}
              onClick={handleMicClick}
            />
          )}
          {currentLanguage !== 'en' && (
            <IconButton icon="fa fa-keyboard-o" onClick={HandleKeyboardToggle} />
          )}
        </div>
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
            {currentWriter !== 'all' && (
              <FilterTag
                close={() => {
                  setCurrentWriter('all');
                  analytics.trackEvent({
                    category: 'search',
                    action: 'remove-filter',
                    label: 'writer',
                    value: currentWriter,
                  });
                }}
                title={currentWriter}
                filterType={i18n.t('SEARCH.WRITER')}
              />
            )}
            {currentRaag !== 'all' && (
              <FilterTag
                close={() => {
                  setCurrentRaag('all');
                  analytics.trackEvent({
                    category: 'search',
                    action: 'remove-filter',
                    label: 'raag',
                    value: currentRaag,
                  });
                }}
                title={currentRaag}
                filterType={i18n.t('SEARCH.RAAG')}
              />
            )}
            {currentSource !== 'all' && (
              <FilterTag
                close={() => {
                  setCurrentSource('all');
                  analytics.trackEvent({
                    category: 'search',
                    action: 'remove-filter',
                    label: 'source',
                    value: currentSource,
                  });
                }}
                title={i18n.t(`SEARCH.SOURCES.${sourcesObj[currentSource]}.TEXT`)}
                filterType={i18n.t('SEARCH.SOURCE')}
              />
            )}
          </div>
        )}
        <div className="filters">
          <span className="filters-label">Filter by </span>
          <FilterDropdown
            title="Writer"
            onChange={(event) => {
              setCurrentWriter(event.target.value);
              analytics.trackEvent({
                category: 'search',
                action: 'set-filter',
                label: 'writer',
                value: event.target.value,
              });
            }}
            optionsArray={writerArray}
            currentValue={currentWriter}
          />
          <FilterDropdown
            title="Raag"
            onChange={(event) => {
              setCurrentRaag(event.target.value);
              analytics.trackEvent({
                category: 'search',
                action: 'set-filter',
                label: 'raag',
                value: event.target.value,
              });
            }}
            optionsArray={raagArray}
            currentValue={currentRaag}
          />
          <FilterDropdown
            title="Source"
            onChange={(event) => {
              setCurrentSource(event.target.value);
              analytics.trackEvent({
                category: 'search',
                action: 'set-filter',
                label: 'source',
                value: event.target.value,
              });
            }}
            optionsArray={sourceArray}
            currentValue={currentSource}
          />
        </div>
      </div>
      <div className={classNames('search-results', isShowFiltersTag && 'filter-applied')}>
        <div className="verse-block">
          <Virtuoso
            data={filteredShabads}
            overscan={200}
            endReached={loadMoreSearchResults}
            itemContent={(index, { ang, shabadId, sourceId, verse, verseId, writer, raag }) => (
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
                currentLanguage={currentLanguage}
              />
            )}
          ></Virtuoso>
        </div>
      </div>
    </div>
  );
};

export default SearchContent;
