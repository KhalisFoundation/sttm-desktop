import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

import classNames from '../../common/utils/classnames';
import { loadShabad } from '../utils';
import { i18n } from '../../common/i18n';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// Shows the shabad's overview slide (its home line, raag, writer and a QR code)
// on the display, or, while it's up, goes back to the shabad's lines. Only for
// shabads from Guru Granth Sahib: the raag descriptions are for its raags, and
// banis and ceremonies mix raags and writers.
const ShabadOverviewIcon = ({ paneId }) => {
  const navigatorState = useStoreState((state) => state.navigator);
  const { activeShabadId, shabadOverview, isMiscSlide, isSundarGutkaBani, isCeremonyBani } =
    navigatorState;
  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);
  const { setShabadOverview, setIsMiscSlide } = useStoreActions((state) => state.navigator);

  const isMultiPane = currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE');
  const pane = navigatorState[`pane${paneId || defaultPaneId}`];
  const isShabad = isMultiPane
    ? pane?.baniType === 'shabad'
    : !isSundarGutkaBani && !isCeremonyBani;
  const shabadId = isShabad ? (isMultiPane ? pane?.activeShabad : activeShabadId) : null;

  // The shabad's line ids (the pane's home verse is an index into them) and
  // whether it's from Guru Granth Sahib.
  const [shabad, setShabad] = useState({ id: null, verseIds: [], isGuruGranthSahib: false });
  useEffect(() => {
    let isCurrent = true;
    if (shabadId) {
      loadShabad(shabadId).then((verses) => {
        if (isCurrent) {
          setShabad({
            id: shabadId,
            verseIds: verses.map((verse) => verse.ID),
            isGuruGranthSahib: verses[0]?.Source?.SourceID === 'G',
          });
        }
      });
    }
    return () => {
      isCurrent = false;
    };
  }, [shabadId]);

  if (!shabadId || shabad.id !== shabadId || !shabad.isGuruGranthSahib) {
    return null;
  }

  const isShown = shabadOverview?.shabadId === shabadId && !isMiscSlide;

  const toggleOverview = () => {
    if (isShown) {
      setShabadOverview(null);
      return;
    }
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    setShabadOverview({
      shabadId,
      verseId: shabad.verseIds[pane?.homeVerse] || shabad.verseIds[0],
    });
    analytics.trackEvent({
      category: 'display',
      action: 'shabad-overview',
      label: 'shabadId',
      value: shabadId,
    });
  };

  return (
    <button
      className={classNames('shabad-overview-btn', isShown && 'shabad-overview-btn--active')}
      title={i18n.t('SHABAD_OVERVIEW.BUTTON_TOOLTIP')}
      onClick={toggleOverview}
    >
      <i className="fa-solid fa-info"></i>
    </button>
  );
};

ShabadOverviewIcon.propTypes = {
  paneId: PropTypes.number,
};

export default ShabadOverviewIcon;
