import React, { useState, useEffect, useRef } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { Virtuoso } from 'react-virtuoso';
import { ipcRenderer } from 'electron';
import PropTypes from 'prop-types';

import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';
import {
  changeHomeVerse,
  changeVerse,
  sendToBaniController,
  filterRequiredVerseItems,
  udpateHistory,
  scrollToVerse,
  saveToHistory,
} from './utils';
import { filterOverlayVerseItems } from './utils/filter-verse-items';

const baniLengthCols = {
  short: 'existsSGPC',
  medium: 'existsMedium',
  long: 'existsTaksal',
  extralong: 'existsBuddhaDal',
};

export const ShabadText = ({
  shabadId,
  baniType,
  paneAttributes,
  setPaneAttributes,
  currentPane,
}) => {
  const [filteredItems, setFilteredItems] = useState([]);
  const [rawVerses, setRawVerses] = useState([]);
  const {
    activeVerseId,
    isMiscSlide,
    isSundarGutkaBani,
    sundarGutkaBaniId,
    isCeremonyBani,
    ceremonyId,
    activeShabadId,
    verseHistory,
    initialVerseId,
    activePaneId,
  } = useStoreState((state) => state.navigator);

  const { baniLength, liveFeed } = useStoreState((state) => state.userSettings);

  const { setActiveVerseId, setIsMiscSlide, setActiveShabadId, setVerseHistory, setActivePaneId } =
    useStoreActions((actions) => actions.navigator);
  const [activeVerse, setActiveVerse] = useState({});

  const virtuosoRef = useRef(null);

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformID = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    if (activePaneId !== currentPane) {
      setActivePaneId(currentPane);
    }
    changeVerse(newTraversedVerse, verseIndex, shabadId, {
      activeVerseId,
      setActiveVerseId,
      setActiveVerse,
      activeShabadId,
      setActiveShabadId,
    });
    udpateHistory(shabadId, newTraversedVerse, {
      verseHistory,
      setVerseHistory,
      setPaneAttributes,
      paneAttributes,
    });
    sendToBaniController(crossPlatformID, filteredItems, newTraversedVerse, baniLength, {
      isSundarGutkaBani,
      sundarGutkaBaniId,
      isCeremonyBani,
      ceremonyId,
      activeShabadId,
      paneAttributes,
    });
  };

  const updateHomeVerse = (verseIndex) => {
    changeHomeVerse(verseIndex, { paneAttributes, setPaneAttributes });
  };

  useEffect(() => {
    if (baniType === 'shabad') {
      loadShabad(shabadId).then((verseList) => {
        if (verseList.length) {
          setRawVerses(verseList);
          saveToHistory(
            shabadId,
            verseList,
            baniType,
            { verseHistory, setVerseHistory, baniLength },
            initialVerseId,
          );
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'bani') {
      loadBani(shabadId, baniLengthCols[baniLength]).then((verseList) => {
        if (verseList.length) {
          setRawVerses(verseList);
          saveToHistory(
            shabadId,
            verseList,
            baniType,
            { verseHistory, setVerseHistory, baniLength },
            initialVerseId,
          );
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'ceremony') {
      loadCeremony(shabadId).then((verseList) => {
        if (verseList.length) {
          setRawVerses(verseList);
          saveToHistory(
            shabadId,
            verseList,
            baniType,
            { verseHistory, setVerseHistory, baniLength },
            initialVerseId,
          );
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    }
  }, [shabadId, baniType, baniLength]);

  useEffect(() => {
    if (filteredItems.length) {
      setTimeout(() => {
        scrollToVerse(initialVerseId, filteredItems, virtuosoRef);
      }, 100);
      const initialVerseIndex = filteredItems.findIndex(
        (verse) => verse.verseId === initialVerseId,
      );
      const activeVerseIndex = filteredItems.findIndex((verse) => verse.verseId === activeVerseId);
      if (initialVerseIndex >= 0) {
        updateHomeVerse(initialVerseIndex);
        setActiveVerse({ [activeVerseIndex]: activeVerseId });
      }
      if (activeShabadId === null) {
        updateTraversedVerse(initialVerseId, initialVerseIndex);
      }
    }
  }, [filteredItems]);

  useEffect(() => {
    const overlayVerse = filterOverlayVerseItems(rawVerses, activeVerseId);
    ipcRenderer.send(
      'show-line',
      JSON.stringify({
        Line: overlayVerse,
        live: liveFeed,
      }),
    );
  }, [activeShabadId, activeVerseId]);

  return (
    <div className="shabad-list">
      <div className="verse-block">
        <Virtuoso
          id={`shabad-text-${currentPane}`}
          data={filteredItems}
          ref={virtuosoRef}
          totalCount={filteredItems.length}
          itemContent={(index, verseObj) => {
            const { verseId, verse, english } = verseObj;
            return (
              <ShabadVerse
                key={index}
                activeVerse={activeVerse}
                isHomeVerse={paneAttributes.homeVerse}
                lineNumber={index}
                versesRead={paneAttributes.versesRead}
                verse={verse}
                englishVerse={english}
                verseId={verseId}
                changeHomeVerse={updateHomeVerse}
                updateTraversedVerse={updateTraversedVerse}
              />
            );
          }}
        />
      </div>
    </div>
  );
};

ShabadText.propTypes = {
  shabadId: PropTypes.number,
  initialVerseId: PropTypes.number,
  baniType: PropTypes.string,
  paneAttributes: PropTypes.object,
  setPaneAttributes: PropTypes.func,
  currentPane: PropTypes.number,
};
