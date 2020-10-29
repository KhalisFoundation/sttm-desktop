import React from 'react';

const WorkspaceBar = () => {
  const workspaces = ['Presentation', 'Single Screen'];

  return (
    <div className="workspace-bar">
      <div className="workspace-item"> </div>
      {workspaces.map((workspace, index) => {
        return (
          <span className={`workspace-item ws-${workspace}`} key={index}>
            {workspace}
          </span>
        );
      })}
    </div>
  );
};

export default WorkspaceBar;
