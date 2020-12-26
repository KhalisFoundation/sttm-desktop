import React, { useState } from 'react';
import { remote } from 'electron';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const { store } = remote.require('./app');

const WorkspaceBar = () => {
  const presenterIdentifier = i18n.t('WORKSPACES.PRESENTER');
  const workspaces = [presenterIdentifier, i18n.t('WORKSPACES.SINGLE_DISPLAY')];
  const defaultWsState = store.getUserPref('app.layout.presenter-view')
    ? workspaces[0]
    : workspaces[1];
  const [currentWorkspace, setWorkspace] = useState(defaultWsState);

  const handleWorkspaceChange = workspace => {
    const moveToPresenter = workspace === presenterIdentifier;
    store.setUserPref('app.layout.presenter-view', moveToPresenter);
    global.platform.updateSettings();
    global.controller['presenter-view']();
    setWorkspace(workspace);
    analytics.trackEvent('changed workspace', workspace);
  };

  return (
    <div className="workspace-bar">
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
