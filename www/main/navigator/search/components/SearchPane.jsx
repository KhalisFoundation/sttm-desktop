import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import Pane from '../../../common/sttm-ui/pane/Pane';
import SearchContent from './SearchContent';
import SearchFooter from './SearchFooter';
import SearchHeader from './SearchHeader';
import { classNames } from '../../../common/utils';
import { setAutopilotSlot } from '../../../addons/voice-follow/components/autopilotSlot';
import AudioCaptureIcon from '../../../addons/voice-follow/components/AudioCaptureIcon';
import AutopilotIntro from '../../../addons/voice-follow/components/AutopilotIntro';

const { SHADOW_BUILD } = require('../../../addons/voice-follow/shadow/config');

// Autopilot tab: Voice-Follow renders its live view into this slot (see autopilotSlot.js).
const AutopilotContent = () => <div className="vf-autopilot-slot" ref={setAutopilotSlot} />;

// The label shimmers whenever the Autopilot tab is not the open one; the NEW chip shows only until the
// tab is first opened.
const TAB_SEEN_KEY = 'vfTabSeen';
const readTabSeen = () => {
  try {
    return window.localStorage.getItem(TAB_SEEN_KEY) === '1';
  } catch (_) {
    return false;
  }
};

const SearchPane = ({ className }) => {
  const { autopilotEnabled, autopilotLive } = useStoreState((state) => state.app);
  const { setAutopilotEnabled } = useStoreActions((actions) => actions.app);
  const { voiceFollowEnabled } = useStoreState((state) => state.userSettings);
  // Voice-Follow can be switched off in Settings; in tester builds it still follows in the
  // shadow (addons/voice-follow/shadow) whether or not the tab is shown.
  const showAutopilot = voiceFollowEnabled !== false || !SHADOW_BUILD;
  const isAutopilot = showAutopilot && autopilotEnabled;
  const [tabSeen, setTabSeen] = useState(readTabSeen);
  useEffect(() => {
    if (!isAutopilot || tabSeen) return;
    setTabSeen(true);
    try {
      window.localStorage.setItem(TAB_SEEN_KEY, '1');
    } catch (_) {
      // private storage: the look simply returns next launch
    }
  }, [isAutopilot, tabSeen]);
  const isNew = !isAutopilot && !tabSeen;

  return (
    <div
      className={classNames(
        'pane-container search-pane',
        showAutopilot && 'has-tabs',
        isAutopilot && 'autopilot-pane',
        className,
      )}
    >
      {showAutopilot && (
        <div className="pane-header search-pane-tabs" role="tablist">
          <a
            role="tab"
            aria-selected={!isAutopilot}
            className={classNames('search-pane-tab', !isAutopilot && 'search-pane-tab-active')}
            onClick={() => setAutopilotEnabled(false)}
          >
            <i className="fa fa-search" aria-hidden="true" />
            <span>Search</span>
          </a>
          <a
            role="tab"
            aria-selected={isAutopilot}
            className={classNames(
              'search-pane-tab',
              isAutopilot && 'search-pane-tab-active',
              !isAutopilot && 'vf-tab-shimmer',
              isNew && 'vf-tab-new',
            )}
            onClick={() => setAutopilotEnabled(true)}
          >
            <AudioCaptureIcon />
            <span className="vf-tab-label">Voice Autopilot</span>
            {isNew && <span className="vf-tab-chip">New</span>}
            {autopilotLive && <span className="search-pane-tab-live" title="Listening" />}
            {!isAutopilot && <AutopilotIntro onStart={() => setAutopilotEnabled(true)} />}
          </a>
        </div>
      )}
      {isAutopilot ? (
        <Pane content={AutopilotContent} />
      ) : (
        <Pane header={SearchHeader} content={SearchContent} footer={SearchFooter} />
      )}
    </div>
  );
};

SearchPane.propTypes = {
  className: PropTypes.string,
};

export default SearchPane;
