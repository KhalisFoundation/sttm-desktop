import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import Pane from '../../../common/sttm-ui/pane/Pane';
import SearchContent from './SearchContent';
import SearchFooter from './SearchFooter';
import SearchHeader from './SearchHeader';
import { classNames } from '../../../common/utils';
import { setAutopilotSlot } from '../../../addons/voice-follow/components/autopilotSlot';
import AudioCaptureIcon from '../../../addons/voice-follow/components/AudioCaptureIcon';

const { SHADOW_BUILD } = require('../../../addons/voice-follow/shadow/config');

// Autopilot tab: Voice-Follow renders its live view into this slot (see autopilotSlot.js).
const AutopilotContent = () => <div className="vf-autopilot-slot" ref={setAutopilotSlot} />;

const SearchPane = ({ className }) => {
  const { autopilotEnabled, autopilotLive } = useStoreState((state) => state.app);
  const { setAutopilotEnabled } = useStoreActions((actions) => actions.app);
  const { voiceFollowEnabled } = useStoreState((state) => state.userSettings);
  // Voice-Follow can be switched off in Settings; in tester builds it still follows in the
  // shadow (addons/voice-follow/shadow) whether or not the tab is shown.
  const showAutopilot = voiceFollowEnabled !== false || !SHADOW_BUILD;
  const isAutopilot = showAutopilot && autopilotEnabled;

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
            className={classNames('search-pane-tab', isAutopilot && 'search-pane-tab-active')}
            onClick={() => setAutopilotEnabled(true)}
          >
            <AudioCaptureIcon />
            <span>Autopilot</span>
            {autopilotLive && <span className="search-pane-tab-live" title="Listening" />}
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
