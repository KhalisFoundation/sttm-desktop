import React from 'react';
import { useStoreState } from 'easy-peasy';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import { MiscPane } from './misc/components';
import ViewerPane from './viewer/ViewerPane';
import { Pane } from '../common/sttm-ui/pane';
import { singleDisplayContent, singleDisplayFooter, singleDisplayHeader } from './single-display';

const Navigator = () => {
  const { isSingleDisplayMode } = useStoreState(state => state.userSettings);

  return (
    <>
      {isSingleDisplayMode ? (
        <>
          <div className="single-display-controller">
            <Pane
              header={singleDisplayHeader}
              content={singleDisplayContent}
              footer={singleDisplayFooter}
            />
          </div>
          <div className="single-display-viewer">
            <ViewerPane />
          </div>
        </>
      ) : (
        <>
          <div className="navigator-row">
            <SearchPane />
            <ShabadPane />
          </div>
          <div className="navigator-row">
            <ViewerPane />
            <MiscPane />
          </div>
        </>
      )}
    </>
  );
};

export default Navigator;
