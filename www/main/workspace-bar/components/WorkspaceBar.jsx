import React, { useState } from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { updateViewerScale } from '../../viewer/utils';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const { store } = remote.require('./app');

const WorkspaceBar = () => {
  const { isSingleDisplayMode } = useStoreState(state => state.userSettings);
  const { setIsSingleDisplayMode } = useStoreActions(state => state.userSettings);
  const { minimizedBySingleDisplay } = useStoreState(state => state.navigator);

  const presenterIdentifier = i18n.t('WORKSPACES.PRESENTER');
  const workspaces = [presenterIdentifier, i18n.t('WORKSPACES.SINGLE_DISPLAY')];
  const defaultWsState = store.getUserPref('app.layout.presenter-view')
    ? workspaces[0]
    : workspaces[1];
  const [currentWorkspace, setWorkspace] = useState(defaultWsState);

  const handleWorkspaceChange = workspace => {
    const moveToPresenter = workspace === presenterIdentifier;
    if (moveToPresenter) {
      if (isSingleDisplayMode) {
        setIsSingleDisplayMode(false);
      }
      store.setUserPref('app.layout.presenter-view', moveToPresenter);
      global.platform.updateSettings();
      global.controller['presenter-view']();
    } else if (!isSingleDisplayMode) {
      setIsSingleDisplayMode(true);
    }
    setWorkspace(workspace);
    analytics.trackEvent('changed workspace', workspace);
    setTimeout(() => {
      updateViewerScale();
    }, 2500);
  };

  return (
    <div
      className={`workspace-bar 
      ${minimizedBySingleDisplay ? 'single-display-hide-top' : 'single-display-show-top'}`}
    >
      {workspaces.map((workspace, index) => {
        return (
          <div
            key={index}
            className={currentWorkspace === workspace ? 'active' : 'inactive'}
            onClick={() => {
              handleWorkspaceChange(workspace);
            }}
          >
            <span className="workspace-name"> {workspace} </span>
          </div>
        );
      })}
    </div>
  );
};

export default WorkspaceBar;
