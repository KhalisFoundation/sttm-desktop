import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { updateViewerScale } from '../../viewer/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

// const { store } = remote.require('./app');

const WorkspaceBar = () => {
  const { currentWorkspace } = useStoreState((state) => state.userSettings);
  const { minimizedBySingleDisplay } = useStoreState((state) => state.navigator);
  const { setCurrentWorkspace } = useStoreActions((state) => state.userSettings);

  const presenterIdentifier = i18n.t('WORKSPACES.PRESENTER');
  const singleDisplayIdentifier = i18n.t('WORKSPACES.SINGLE_DISPLAY');
  const multiPaneIdentifier = i18n.t('WORKSPACES.MULTI_PANE');
  const workspaces = [presenterIdentifier, singleDisplayIdentifier, multiPaneIdentifier];

  const handleWorkspaceChange = (workspace) => {
    const moveToPresenter = workspace === presenterIdentifier;
    if (moveToPresenter) {
      global.controller['presenter-view']();
    }
    if (currentWorkspace !== workspace) {
      setCurrentWorkspace(workspace);
    }
    analytics.trackEvent('changed workspace', workspace);
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
    </div>
  );
};

export default WorkspaceBar;
