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
  filterRequiredVerseItems,
  filterOverlayVerseItems,
  udpateHistory,
  scrollToVerse,
  saveToHistory,
  copyToClipboard,
  intelligentNextVerse,
  sendToBaniController,
  ASA_DI_VAAR_BANI_ID,
  isFlowerVerse,
} from './utils';

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
  const [previousVerseIndex, setPreviousIndex] = useState();
  const [filteredItems, setFilteredItems] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const [rawVerses, setRawVerses] = useState([]);
  const [atHome, setHome] = useState(true);

  const virtuosoRef = useRef(null);
  const activeVerseRef = useRef(null);
  // Id of the shabad/bani whose verses are currently in filteredItems.
  const loadedShabadIdRef = useRef(null);

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
    shortcuts,
    lineNumber,
    savedCrossPlatformId,
  } = useStoreState((state) => state.navigator);

  const { baniLength, liveFeed, autoplayDelay, autoplayToggle, intelligentSpacebar, akhandpatt } =
    useStoreState((state) => state.userSettings);

  const {
    setActiveVerseId,
    setIsMiscSlide,
    setActiveShabadId,
    setVerseHistory,
    setActivePaneId,
    setShortcuts,
    setSundarGutkaBaniId,
    setCeremonyId,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
  } = useStoreActions((actions) => actions.navigator);

  const isAsaDiVaar = baniType === 'bani' && Number(shabadId) === ASA_DI_VAAR_BANI_ID;

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformId = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    // Ignoring flower verse to avoid unwanted scroll during asa di vaar
    if (isFlowerVerse(newTraversedVerse, isAsaDiVaar)) {
      return;
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
      setPreviousIndex,
      baniType,
      sundarGutkaBaniId,
      setSundarGutkaBaniId,
      ceremonyId,
      setCeremonyId,
      isSundarGutkaBani,
      setIsSundarGutkaBani,
      isCeremonyBani,
      setIsCeremonyBani,
    });
    udpateHistory(shabadId, newTraversedVerse, {
      verseHistory,
      setVerseHistory,
      setPaneAttributes,
      paneAttributes,
    });
    sendToBaniController(crossPlatformId, filteredItems, newTraversedVerse, baniLength, {
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

  const setVerseList = (verseList) => {
    if (verseList.length) {
      setRawVerses(verseList);
      saveToHistory(
        shabadId,
        verseList,
        baniType,
        { verseHistory, setVerseHistory, baniLength },
        initialVerseId,
      );
      const filtered = filterRequiredVerseItems(verseList);
      loadedShabadIdRef.current = shabadId;
      setFilteredItems(filtered);
      const resumeVerseId = paneAttributes?.activeVerse || filtered[0].verseId;
      if (filtered.length > 0) {
        const resumeVerseIndex = filtered.findIndex((v) => v.verseId === resumeVerseId);
        if (resumeVerseIndex >= 0) {
          updateTraversedVerse(resumeVerseId, resumeVerseIndex);
        } else {
          updateTraversedVerse(filtered[0].verseId, 0);
        }
      }
    }
  };

  useEffect(() => {
    if (baniType === 'shabad') {
      loadShabad(shabadId).then(setVerseList);
    } else if (baniType === 'bani') {
      loadBani(shabadId, baniLengthCols[baniLength]).then(setVerseList);
    } else if (baniType === 'ceremony') {
      loadCeremony(shabadId).then(setVerseList);
    }
  }, [shabadId, baniType, baniLength]);

  // Re-opening the bani that is already loaded (from Sundar Gutka) doesn't
  // change shabadId, so nothing reloads. Restart it from the first verse here.
  // A different bani is still loading, so setVerseList handles that case.
  useEffect(() => {
    if (
      paneAttributes.baniOpenedAt &&
      baniType === 'bani' &&
      loadedShabadIdRef.current === shabadId &&
      filteredItems.length
    ) {
      updateTraversedVerse(filteredItems[0].verseId, 0);
      scrollToVerse(filteredItems[0].verseId, filteredItems, virtuosoRef, isAsaDiVaar);
    }
  }, [paneAttributes.baniOpenedAt]);

  useEffect(() => {
    if (filteredItems.length) {
      setTimeout(() => {
        scrollToVerse(initialVerseId, filteredItems, virtuosoRef, isAsaDiVaar);
      }, 100);
      const initialVerseIndex = filteredItems.findIndex(
        (verse) => verse.verseId === initialVerseId,
      );
      const activeVerseIndex = filteredItems.findIndex((verse) => verse.verseId === activeVerseId);
      if (initialVerseIndex >= 0) {
        updateHomeVerse(initialVerseIndex);
        setActiveVerse({ [activeVerseIndex]: activeVerseId });
      }
      if (
        (activeShabadId === null && sundarGutkaBaniId === null && ceremonyId === null) ||
        (initialVerseIndex >= 0 && Object.keys(activeVerse).length === 0)
      ) {
        updateTraversedVerse(initialVerseId, initialVerseIndex);
      }
    }
  }, [filteredItems]);

  useEffect(() => {
    // Bani/ceremony verse sync from a controller.
    // Index-based sync for bani/ceremony. The web controller and desktop load
    // the same bani/ceremony, so their verse lists share order and count — but
    // the verse *ids* live in different spaces (ceremonies carry Realm-local
    // IDs with no crossPlatformID; banis differ too), so id matching is
    // unreliable. Select purely by the 1-based line position the controller
    // sends (recorded as lineNumber).
    //
    // Deliberately NOT gated on savedCrossPlatformId: the web's verseId can
    // collide with the loaded verse's id across the two id spaces (e.g. Gur
    // Mantar: activeVerseId 2 == the clicked verse's web verseId 2), which
    // stops the handler from ever setting savedCrossPlatformId on the first
    // change — the display would then stay stuck on the opening verse. Position
    // drives it regardless. id-match remains the fallback for shabad and native
    // (mobile) controllers, which send a crossPlatformId but no line position.
    const isPosition = baniType === 'bani' || baniType === 'ceremony';
    const positionIndex = lineNumber != null ? lineNumber - 1 : -1;
    const hasValidPosition =
      isPosition && positionIndex >= 0 && positionIndex < filteredItems.length;
    let baniVerseIndex = -1;
    if (hasValidPosition) {
      baniVerseIndex = positionIndex;
    } else if (savedCrossPlatformId != null) {
      baniVerseIndex = filteredItems.findIndex(
        (obj) =>
          obj.crossPlatformId === savedCrossPlatformId || obj.verseId === savedCrossPlatformId,
      );
    }
    if (baniVerseIndex >= 0) {
      const matched = filteredItems[baniVerseIndex];
      // Pass `verseId` (the verse's real id), NOT `ID` (the filtered array
      // index). `activeVerseId` drives `filterOverlayVerseItems(rawVerses, …)`
      // for the projected `show-line`, which matches `obj.ID === activeVerseId`
      // — with the array index it matched nothing and projected an empty verse,
      // so the display never moved for controller-driven bani/ceremony changes.
      updateTraversedVerse(matched.verseId, baniVerseIndex);
      // Highlighting alone doesn't move the virtualized list — scroll the
      // presenter view to the matched verse so the display actually changes.
      scrollToVerse(matched.verseId, filteredItems, virtuosoRef, isAsaDiVaar);
    }
    // `filteredItems` is a dep so a verse that arrives after the bani finishes
    // loading (the transient `matchIdx = -1` case) is picked up on the next
    // render. Safe because a new bani clears savedCrossPlatformId to null (guard
    // above), so this never re-applies a stale verse to a freshly-loaded bani.
    // `lineNumber` is a dep so a ceremony verse change that only moves the line
    // position (same savedCrossPlatformId space) still re-resolves by position.
  }, [savedCrossPlatformId, filteredItems, lineNumber]);

  useEffect(() => {
    const overlayVerse = filterOverlayVerseItems(rawVerses, activeVerseId);
    ipcRenderer.send(
      'show-line',
      JSON.stringify({
        Line: overlayVerse,
        live: liveFeed,
      }),
    );
    if (
      (isCeremonyBani && ceremonyId === paneAttributes.activeShabad) ||
      (isSundarGutkaBani && sundarGutkaBaniId === paneAttributes.activeShabad) ||
      (!isSundarGutkaBani && !isCeremonyBani && activeShabadId === paneAttributes.activeShabad)
    ) {
      if (lineNumber !== null && filteredItems[lineNumber - 1]?.verseId === activeVerseId) {
        setActiveVerse({ [lineNumber - 1]: activeVerseId });
        scrollToVerse(activeVerseId, filteredItems, virtuosoRef, isAsaDiVaar);
      }
    }
  }, [rawVerses, activeShabadId, activeVerseId, sundarGutkaBaniId, ceremonyId]);

  useEffect(() => {
    // Picking another verse of the shabad that's already open (e.g. searching a
    // different line of it) changes activeVerseId without reloading the list, so
    // the list's own position (activeVerse, which the arrow keys move from) stayed
    // on the old verse. Move it as if that verse had been clicked.
    if (baniType !== 'shabad' || isSundarGutkaBani || isCeremonyBani) return;
    if (activeShabadId !== shabadId || loadedShabadIdRef.current !== shabadId) return;
    if (Object.values(activeVerse).includes(activeVerseId)) return;
    const verseIndex = filteredItems.findIndex(({ verseId }) => verseId === activeVerseId);
    if (verseIndex >= 0) {
      // Jump straight there: a smooth scroll to a far-off verse left the list on
      // the old verse for a moment after the display had already changed.
      scrollToVerse(activeVerseId, filteredItems, virtuosoRef, isAsaDiVaar, 'auto');
      updateTraversedVerse(activeVerseId, verseIndex);
    }
  }, [activeVerseId]);

  const getVerse = (direction) => {
    let verseIndex = null;
    if (direction === 'next') {
      Object.keys(activeVerse).forEach((activeVerseIndex) => {
        if (filteredItems.length - 1 > parseInt(activeVerseIndex, 10)) {
          let nextVerseIndex = parseInt(activeVerseIndex, 10) + 1;
          // Ignoring flower verse to avoid unwanted scroll during asa di vaar
          if (isFlowerVerse(filteredItems[nextVerseIndex].verseId, isAsaDiVaar)) {
            nextVerseIndex++;
          }
          verseIndex = nextVerseIndex;
        }
      });
    } else if (direction === 'prev') {
      Object.keys(activeVerse).forEach((activeVerseIndex) => {
        if (parseInt(activeVerseIndex, 10) > 0) {
          let prevVerseIndex = parseInt(activeVerseIndex, 10) - 1;
          // Ignoring flower verse to avoid unwanted scroll during asa di vaar
          if (isFlowerVerse(filteredItems[prevVerseIndex].verseId, isAsaDiVaar)) {
            prevVerseIndex--;
          }
          verseIndex = prevVerseIndex;
        }
      });
    }
    if (verseIndex !== null) {
      const { verseId } = filteredItems[verseIndex];
      return { verseIndex, verseId };
    }
    return null;
  };

  useEffect(() => {
    if (activePaneId === currentPane) {
      if (shortcuts.nextVerse) {
        const nextVerse = getVerse('next');
        if (nextVerse) {
          updateTraversedVerse(nextVerse.verseId, nextVerse.verseIndex);
          scrollToVerse(nextVerse.verseId, filteredItems, virtuosoRef, isAsaDiVaar);
        } else if (akhandpatt && !isSundarGutkaBani && !isCeremonyBani) {
          setShortcuts({
            ...shortcuts,
            nextShabad: true,
            nextVerse: false,
          });
        }
        setShortcuts({
          ...shortcuts,
          nextVerse: false,
        });
      }
      if (shortcuts.prevVerse) {
        const prevVerse = getVerse('prev');
        if (prevVerse) {
          updateTraversedVerse(prevVerse.verseId, prevVerse.verseIndex);
          scrollToVerse(prevVerse.verseId, filteredItems, virtuosoRef, isAsaDiVaar);
        }
        setShortcuts({
          ...shortcuts,
          prevVerse: false,
        });
      }
      if (shortcuts.homeVerse) {
        const verse = intelligentNextVerse(filteredItems, {
          activeVerseId: paneAttributes.activeVerse,
          previousVerseIndex,
          setPreviousIndex,
          atHome,
          setHome,
          homeVerse: paneAttributes.homeVerse,
          intelligentSpacebar,
        });
        if (verse) {
          updateTraversedVerse(verse.verseId, verse.verseIndex);
          scrollToVerse(verse.verseId, filteredItems, virtuosoRef, isAsaDiVaar);
        }
        setShortcuts({
          ...shortcuts,
          homeVerse: false,
        });
      }
      if (shortcuts.copyToClipboard) {
        copyToClipboard(activeVerseRef);
        setShortcuts({
          ...shortcuts,
          copyToClipboard: false,
        });
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    const milisecondsDelay = parseInt(autoplayDelay, 10) * 1000;
    const interval = setInterval(() => {
      if (autoplayToggle) {
        setShortcuts({
          ...shortcuts,
          nextVerse: true,
        });
      }
    }, milisecondsDelay);
    return () => {
      clearInterval(interval);
    };
  }, [autoplayToggle, autoplayDelay]);

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
                activeVerseRef={activeVerseRef}
                verse={verse}
                englishVerse={english}
                verseId={verseId}
                isFlowerVerse={isFlowerVerse(verseId, isAsaDiVaar)}
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
