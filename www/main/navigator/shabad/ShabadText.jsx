import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';
import {
  changeHomeVerse,
  changeVerse,
  sendToBaniController,
  filterRequiredVerseItems,
  udpateHistory,
} from './utils';
import { saveToHistory } from './utils/save-to-history';

const baniLengthCols = {
  short: 'existsSGPC',
  medium: 'existsMedium',
  long: 'existsTaksal',
  extralong: 'existsBuddhaDal',
};

export const ShabadText = ({
  shabadId,
  baniType,
  baniLength,
  paneAttributes,
  setPaneAttributes,
}) => {
  const [filteredItems, setFilteredItems] = useState([]);
  const {
    homeVerse,
    activeVerseId,
    isMiscSlide,
    isSundarGutkaBani,
    sundarGutkaBaniId,
    isCeremonyBani,
    ceremonyId,
    activeShabadId,
    verseHistory,
    initialVerseId,
  } = useStoreState((state) => state.navigator);

  const { setHomeVerse, setActiveVerseId, setIsMiscSlide, setActiveShabadId, setVerseHistory } =
    useStoreActions((actions) => actions.navigator);
  const [activeVerse, setActiveVerse] = useState({});

  useEffect(() => {
    if (baniType === 'shabad') {
      loadShabad(shabadId).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'bani') {
      loadBani(shabadId, baniLengthCols[baniLength]).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    } else if (baniType === 'ceremony') {
      loadCeremony(shabadId).then((verseList) => {
        if (verseList.length) {
          setFilteredItems(filterRequiredVerseItems(verseList));
        }
      });
    }
  }, [shabadId, baniType, baniLength]);

  useEffect(() => {
    if (filteredItems.length) {
      saveToHistory(
        shabadId,
        filteredItems,
        baniType,
        { verseHistory, setVerseHistory, baniLength },
        initialVerseId,
      );
    }
  }, [filteredItems]);

  const updateHomeVerse = (verseIndex) => {
    changeHomeVerse(verseIndex, { homeVerse, setHomeVerse });
  };

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformID = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
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
      homeVerse,
    });
  };

  return (
    <div className="shabad-list">
      <div className="verse-block">
        <Virtuoso
          data={filteredItems}
          totalCount={filteredItems.length}
          itemContent={(index, verseObj) => {
            const { verseId, verse, english } = verseObj;
            return (
              <ShabadVerse
                key={index}
                activeVerse={activeVerse}
                isHomeVerse={homeVerse}
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
  baniLength: PropTypes.string,
  paneAttributes: PropTypes.object,
  setPaneAttributes: PropTypes.func,
};
