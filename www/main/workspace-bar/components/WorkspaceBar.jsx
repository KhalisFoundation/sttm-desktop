import React, { useState } from 'react';
import { remote } from 'electron';

const { store } = remote.require('./app');

const WorkspaceBar = () => {
  const workspaces = ['Presenter', 'Single Screen'];
  const defaultWsState = store.getUserPref('app.layout.presenter-view')
    ? workspaces[0]
    : workspaces[1];
  const [currentWorkspace, setWorkspace] = useState(defaultWsState);

  const handleWorkspaceChange = workspace => {
    const moveToPresenter = workspace === 'Presenter';
    store.setUserPref('app.layout.presenter-view', moveToPresenter);
    global.platform.updateSettings();
    global.controller['presenter-view']();
    setWorkspace(workspace);
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
