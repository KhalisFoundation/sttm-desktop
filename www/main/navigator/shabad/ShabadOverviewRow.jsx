import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

import classNames from '../../common/utils/classnames';
import { i18n } from '../../common/i18n';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// Only shabads from Guru Granth Sahib whose raag (0 is "No Raag") has a
// description have an overview. Older databases have no descriptions at all.
export const hasOverview = (verses) => {
  if (verses[0]?.Source?.SourceID !== 'G') {
    return false;
  }
  const raag = verses.map((v) => v.Raag).find((r) => r?.RaagID > 0 && r.RaagEnglish);
  return !!raag?.Overview?.trim();
};

// "Slide 0" of a shabad: the first row of its lines, which shows the shabad's
// overview slide (its home line, raag, writer and a QR code) on the display,
// or, while it's up, goes back to the shabad's lines. It's the list's header,
// not one of its lines, so the arrow keys, space bar and controllers (which
// move through the lines) never land on it; only a click does.
const ShabadOverviewRow = ({ shabadId, homeVerseId, paneId }) => {
  const { shabadOverview, isMiscSlide, activePaneId } = useStoreState((state) => state.navigator);
  const { setShabadOverview, setIsMiscSlide, setActivePaneId } = useStoreActions(
    (state) => state.navigator,
  );

  const isShown = shabadOverview?.shabadId === shabadId && !isMiscSlide;

  const toggleOverview = () => {
    if (isShown) {
      setShabadOverview(null);
      return;
    }
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    // As a click on a line does, so the arrow keys carry on from this pane.
    if (activePaneId !== paneId) {
      setActivePaneId(paneId);
    }
    setShabadOverview({ shabadId, verseId: homeVerseId });
    analytics.trackEvent({
      category: 'display',
      action: 'shabad-overview',
      label: 'shabadId',
      value: shabadId,
    });
  };

  // The empty controls column (where a line's ✓ goes) lines the label up with
  // the lines' text.
  return (
    <li
      className={classNames(
        'shabad-pane-list shabad-li shabad-overview-row',
        isShown && 'shabad-pane-active',
      )}
      title={i18n.t('SHABAD_OVERVIEW.ROW_TOOLTIP')}
      onClick={toggleOverview}
    >
      <span className="shabad-pane-controls" />
      <span className="verse-content">
        <i className="fa-solid fa-circle-info" />
        {i18n.t('SHABAD_OVERVIEW.ROW_LABEL')}
      </span>
    </li>
  );
};

ShabadOverviewRow.propTypes = {
  shabadId: PropTypes.number,
  homeVerseId: PropTypes.number,
  paneId: PropTypes.number,
};

export default ShabadOverviewRow;
