import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { i18n } from '../../../common/i18n';

const SearchFooter = () => {
  const { searchShabadsCount, pane1, pane2, pane3, activePaneId } = useStoreState(
    (state) => state.navigator,
  );
  const {
    setActivePaneId,
    setActiveShabadId,
    setActiveVerseId,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setSundarGutkaBaniId,
    setCeremonyId,
  } = useStoreActions((actions) => actions.navigator);
  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);
  const { setDefaultPaneId } = useStoreActions((actions) => actions.userSettings);

  const addActiveClass = (id) => (id === defaultPaneId ? 'active' : '');

  // These buttons used to only change which pane search results land in.
  // Make the clicked pane the live one so Display 1 and Display 2 switch to
  // that pane's list and current line.
  const selectPane = (id) => {
    const panes = { 1: pane1, 2: pane2, 3: pane3 };
    const pane = panes[id];
    if (!pane || pane.locked) return;
    // Copy scalars before dispatching. These setters JSON-sync to the viewer
    // inside the reducer; reading the live pane object across those dispatches
    // can hit a revoked immer proxy and freeze the window.
    const activeShabad = pane.activeShabad;
    const baniType = pane.baniType;
    const verse = pane.activeVerse || null;
    if (defaultPaneId !== id) {
      setDefaultPaneId(id);
    }
    if (activePaneId !== id) {
      setActivePaneId(id);
    }
    if (!activeShabad) return;
    if (baniType === 'bani') {
      setIsCeremonyBani(false);
      setIsSundarGutkaBani(true);
      setSundarGutkaBaniId(activeShabad);
    } else if (baniType === 'ceremony') {
      setIsSundarGutkaBani(false);
      setIsCeremonyBani(true);
      setCeremonyId(activeShabad);
    } else {
      setIsSundarGutkaBani(false);
      setIsCeremonyBani(false);
      setActiveShabadId(activeShabad);
    }
    if (verse) {
      setActiveVerseId(verse);
    }
  };

  return (
    <div className="search-footer">
      <span className="search-footer-span1">Sri Guru Granth Sahib</span>
      <span className="search-footer-span2">Sri Dasam Granth</span>
      <span className="search-footer-span3">Amrit Keertan</span>
      <span className="search-footer-span4">Other</span>
      <span>{searchShabadsCount ? `${searchShabadsCount} Results` : ''}</span>
      {currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE') && (
        <div className="default-pane-switcher">
          <button
            className={`pane-1-btn ${addActiveClass(1)}`}
            onClick={() => selectPane(1)}
            disabled={pane1.locked}
          >
            1
          </button>
          <button
            className={`pane-2-btn ${addActiveClass(2)}`}
            onClick={() => selectPane(2)}
            disabled={pane2.locked}
          >
            2
          </button>
          <button
            className={`pane-3-btn ${addActiveClass(3)}`}
            onClick={() => selectPane(3)}
            disabled={pane3.locked}
          >
            3
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchFooter;
