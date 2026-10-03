import React, { useState, useEffect, useRef } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { Virtuoso } from 'react-virtuoso';
import { ipcRenderer } from 'electron';
import PropTypes from 'prop-types';

import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';
import { useRecordingState } from '../../common/hooks';
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
  FLOWER_VERSE_ID,
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
  isProjection = false,
  projectionSource = false,
}) => {
  const [previousVerseIndex, setPreviousIndex] = useState();
  const [filteredItems, setFilteredItems] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const [rawVerses, setRawVerses] = useState([]);
  const [atHome, setHome] = useState(true);

  const virtuosoRef = useRef(null);
  const activeVerseRef = useRef(null);
  const listScrollRef = useRef(null);
  // Id of the shabad/bani whose verses are currently in filteredItems.
  const loadedShabadIdRef = useRef(null);
  const isRecording = useRecordingState();

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

  const { baniLength, liveFeed, autoplayDelay, autoplayToggle, intelligentSpacebar, akhandpatt, defaultPaneId } =
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

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformId = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    // Ignoring flower verse to avoid unwanted scroll during asa di vaar
    if (newTraversedVerse === FLOWER_VERSE_ID) {
      return;
    }
    // activePaneId is null until first focus — treat null as "this pane is live"
    const livePaneId = activePaneId || defaultPaneId || 1;
    if (livePaneId !== currentPane) {
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
    if (isRecording) {
      ipcRenderer.send('recording-event', { event: 'verse', verseId: newTraversedVerse });
    }
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
      scrollToVerse(filteredItems[0].verseId, filteredItems, virtuosoRef);
    }
  }, [paneAttributes.baniOpenedAt]);

  useEffect(() => {
    if (filteredItems.length) {
      if (isProjection) {
        const liveActiveId = activeVerseId || paneAttributes?.activeVerse;
        const projectedActiveIndex = filteredItems.findIndex(
          (verse) => verse.verseId === liveActiveId,
        );
        if (projectedActiveIndex >= 0) {
          setActiveVerse({ [projectedActiveIndex]: liveActiveId });
        }
        return;
      }
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
      if (
        (activeShabadId === null && sundarGutkaBaniId === null && ceremonyId === null) ||
        (initialVerseIndex >= 0 && Object.keys(activeVerse).length === 0)
      ) {
        updateTraversedVerse(initialVerseId, initialVerseIndex);
      }
    }
  }, [filteredItems, isProjection, paneAttributes?.activeVerse, activeVerseId]);

  useEffect(() => {
if (isProjection) return;
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
      scrollToVerse(matched.verseId, filteredItems, virtuosoRef);
    }
    // `filteredItems` is a dep so a verse that arrives after the bani finishes
    // loading (the transient `matchIdx = -1` case) is picked up on the next
    // render. Safe because a new bani clears savedCrossPlatformId to null (guard
    // above), so this never re-applies a stale verse to a freshly-loaded bani.
    // `lineNumber` is a dep so a ceremony verse change that only moves the line
    // position (same savedCrossPlatformId space) still re-resolves by position.
  }, [isProjection, savedCrossPlatformId, filteredItems, lineNumber]);

  useEffect(() => {
    const overlayVerse = filterOverlayVerseItems(rawVerses, activeVerseId);
    // Only the live controller pane should drive Display 1 / Display 2.
    // Other multipane panes keep their local list but must not overwrite show-line.
    // activePaneId starts as null until the user focuses a pane — treat that as
    // the default pane so the first verse selection still reaches the viewer.
    const livePaneId = activePaneId || defaultPaneId || 1;
    if (!isProjection && Number(livePaneId) === Number(currentPane)) {
      ipcRenderer.send(
        'show-line',
        JSON.stringify({
          Line: overlayVerse,
          live: liveFeed,
          activeVerseId,
          baniType,
          shabadId,
          currentPane,
        }),
      );
    }
    if (
      !isProjection &&
      ((isCeremonyBani && ceremonyId === paneAttributes.activeShabad) ||
        (isSundarGutkaBani && sundarGutkaBaniId === paneAttributes.activeShabad) ||
        (!isSundarGutkaBani && !isCeremonyBani && activeShabadId === paneAttributes.activeShabad))
    ) {
      if (lineNumber !== null && filteredItems[lineNumber - 1]?.verseId === activeVerseId) {
        setActiveVerse({ [lineNumber - 1]: activeVerseId });
        scrollToVerse(activeVerseId, filteredItems, virtuosoRef);
      }
    }
  }, [
    rawVerses,
    activeShabadId,
    activeVerseId,
    sundarGutkaBaniId,
    ceremonyId,
    isProjection,
    activePaneId,
    defaultPaneId,
    currentPane,
    shabadId,
    baniType,
  ]);

  // Display 2: full DOM list (no Virtuoso windowing). Scroll active row into view.
  // Virtuoso only mounts viewport rows — with scaled stage height, bottom rows never
  // enter the item-list and cannot scroll into view. Full list fixes that.
  useEffect(() => {
    if (!isProjection || !filteredItems.length) return undefined;
    const liveActiveId = activeVerseId || paneAttributes?.activeVerse;
    if (liveActiveId == null) return undefined;
    const activeVerseIndex = filteredItems.findIndex((verse) => verse.verseId === liveActiveId);
    if (activeVerseIndex < 0) return undefined;
    setActiveVerse({ [activeVerseIndex]: liveActiveId });

    const apply = () => {
      const el = activeVerseRef.current;
      const scroller = listScrollRef.current;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        return;
      }
      if (scroller && el) {
        const rowTop = el.offsetTop;
        const rowHeight = el.offsetHeight || 0;
        const viewHeight = scroller.clientHeight || 0;
        scroller.scrollTop = Math.max(0, rowTop - (viewHeight - rowHeight) / 2);
      }
    };

    const t1 = setTimeout(apply, 0);
    const t2 = setTimeout(apply, 50);
    const t3 = setTimeout(apply, 150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isProjection, filteredItems, activeVerseId, paneAttributes?.activeVerse]);

  const getVerse = (direction) => {
    let verseIndex = null;
    const activeKeys = Object.keys(activeVerse);
    // Fall back to the live verse id when local highlight map is empty
    // (can happen after pane switches / projection sync) so arrow keys still work.
    if (!activeKeys.length && filteredItems.length) {
      const liveId = activeVerseId || paneAttributes?.activeVerse;
      const fallbackIndex = filteredItems.findIndex((verse) => verse.verseId === liveId);
      if (fallbackIndex >= 0) {
        activeKeys.push(String(fallbackIndex));
      } else if (direction === 'next') {
        activeKeys.push('-1');
      } else {
        activeKeys.push('0');
      }
    }
    if (direction === 'next') {
      activeKeys.forEach((activeVerseIndex) => {
        if (filteredItems.length - 1 > parseInt(activeVerseIndex, 10)) {
          let nextVerseIndex = parseInt(activeVerseIndex, 10) + 1;
          // Ignoring flower verse to avoid unwanted scroll during asa di vaar
          if (filteredItems[nextVerseIndex]?.verseId === FLOWER_VERSE_ID) {
            nextVerseIndex++;
          }
          if (nextVerseIndex < filteredItems.length) {
            verseIndex = nextVerseIndex;
          }
        }
      });
    } else if (direction === 'prev') {
      activeKeys.forEach((activeVerseIndex) => {
        if (parseInt(activeVerseIndex, 10) > 0) {
          let prevVerseIndex = parseInt(activeVerseIndex, 10) - 1;
          // Ignoring flower verse to avoid unwanted scroll during asa di vaar
          if (filteredItems[prevVerseIndex]?.verseId === FLOWER_VERSE_ID) {
            prevVerseIndex--;
          }
          if (prevVerseIndex >= 0) {
            verseIndex = prevVerseIndex;
          }
        }
      });
    }
    if (verseIndex !== null && filteredItems[verseIndex]) {
      const { verseId } = filteredItems[verseIndex];
      return { verseIndex, verseId };
    }
    return null;
  };

  useEffect(() => {
    if (isProjection) return;
    const livePaneId = activePaneId || defaultPaneId || 1;
    if (livePaneId === currentPane) {
      if (shortcuts.nextVerse) {
        const nextVerse = getVerse('next');
        if (nextVerse) {
          updateTraversedVerse(nextVerse.verseId, nextVerse.verseIndex);
          scrollToVerse(nextVerse.verseId, filteredItems, virtuosoRef);
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
          scrollToVerse(prevVerse.verseId, filteredItems, virtuosoRef);
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
          scrollToVerse(verse.verseId, filteredItems, virtuosoRef);
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
    if (isProjection) return undefined;
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
  }, [autoplayToggle, autoplayDelay, isProjection]);

  const renderVerse = (index, verseObj) => {
    const { verseId, verse, english } = verseObj;
    return (
      <ShabadVerse
        key={verseId != null ? verseId : index}
        activeVerse={activeVerse}
        isHomeVerse={paneAttributes.homeVerse}
        lineNumber={index}
        versesRead={paneAttributes.versesRead}
        activeVerseRef={activeVerseRef}
        verse={verse}
        englishVerse={english}
        verseId={verseId}
        changeHomeVerse={updateHomeVerse}
        updateTraversedVerse={updateTraversedVerse}
      />
    );
  };

  return (
    <div className="shabad-list">
      <div className="verse-block" ref={isProjection ? listScrollRef : undefined}>
        {isProjection ? (
          // Full list on Display 2 — every row is in the DOM (no Virtuoso windowing).
          // Controller keeps Virtuoso for performance; projection needs last lines reachable.
          <div className="shabad-list-full" data-testid="shabad-item-list" style={{ width: '100%' }}>
            {filteredItems.map((verseObj, index) => renderVerse(index, verseObj))}
          </div>
        ) : (
          <Virtuoso
            id={`shabad-text-${currentPane}`}
            data={filteredItems}
            ref={virtuosoRef}
            totalCount={filteredItems.length}
            rangeChanged={(range) => {
              if (projectionSource && !isProjection) {
                ipcRenderer.send('projection-range', { paneId: currentPane, ...range });
              }
            }}
            itemContent={(index, verseObj) => renderVerse(index, verseObj)}
          />
        )}
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
  isProjection: PropTypes.bool,
  projectionSource: PropTypes.bool,
};
