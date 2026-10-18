import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { updateViewerScale } from '../../viewer/utils';
import ExperimentalBadge from '../../common/sttm-ui/experimental-badge';
import { i18n } from '../../common/i18n';
import { RecordingChip } from '../../addons/voice-follow/shadow/RecordingNotice';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// const { store } = remote.require('./app');

const WorkspaceBar = () => {
  const { currentWorkspace } = useStoreState((state) => state.userSettings);
  const { minimizedBySingleDisplay } = useStoreState((state) => state.navigator);
  const { setCurrentWorkspace } = useStoreActions((state) => state.userSettings);
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);

  // The recording chip's link: open Settings at Other Options (Voice Autopilot recording).
  const openRecordingSetting = () => {
    setOverlayScreen('settings');
    setTimeout(() => {
      const el = document.getElementById('shadow-recording');
      if (el) el.scrollIntoView({ block: 'center' });
    }, 300);
  };

  const presenterIdentifier = i18n.t('WORKSPACES.PRESENTER');
  const singleDisplayIdentifier = i18n.t('WORKSPACES.SINGLE_DISPLAY');
  const multiPaneIdentifier = i18n.t('WORKSPACES.MULTI_PANE');
  const workspaces = [singleDisplayIdentifier, presenterIdentifier, multiPaneIdentifier];

  const handleWorkspaceChange = (workspace) => {
    const moveToPresenter = workspace === presenterIdentifier;
    if (moveToPresenter) {
      global.controller['presenter-view']();
    }
    if (currentWorkspace !== workspace) {
      setCurrentWorkspace(workspace);
    }
    analytics.trackEvent({
      category: 'workspace',
      action: 'changed',
      label: workspace,
    });
    setTimeout(() => {
      updateViewerScale();
    }, 2500);
  };

  return (
    <div
      className={`workspace-bar 
      ${minimizedBySingleDisplay ? 'single-display-hide-top' : 'single-display-show-top'}`}
    >
      {workspaces.map((workspace, index) => (
        <div
          key={index}
          className={currentWorkspace === workspace ? 'active' : 'inactive'}
          onClick={() => {
            handleWorkspaceChange(workspace);
          }}
        >
          <span className="workspace-name"> {workspace} </span>
        </div>
      ))}
      {/* Right end of the bar: recording chip, then the Experimental badge, side by side */}
      <div className="workspace-bar-right">
        <RecordingChip onOpenSettings={openRecordingSetting} />
        <ExperimentalBadge className="workspace-experimental-badge" />
      </div>
    </div>
  );
};

export default WorkspaceBar;
