import React from 'react';
import { useStoreState } from 'easy-peasy';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import { MiscPane } from './misc/components';
import ViewerPane from './viewer/ViewerPane';
import { Pane } from '../common/sttm-ui/pane';
import { singleDisplayContent, singleDisplayFooter, singleDisplayHeader } from './single-display';
import { useSlides } from '../common/hooks';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const Navigator = () => {
  const { minimizedBySingleDisplay, currentWorkspace } = useStoreState(
    (state) => state.userSettings,
  );

  const {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  } = useSlides();

  let controllerMarkup = null;

  if (currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY')) {
    controllerMarkup = (
      <div
        className={`single-display-controller ${
          minimizedBySingleDisplay ? 'single-display-minimize' : 'single-display-maximize'
        }`}
      >
        <Pane
          header={singleDisplayHeader}
          content={singleDisplayContent}
          footer={singleDisplayFooter}
          className="single-display-pane"
        />
      </div>
    );
  } else if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
    controllerMarkup = (
      <div className="multipane-grid">
        <div className="shabad1-container">
          <ShabadPane multiPaneId={1} />
        </div>
        <div className="shabad2-container">
          <ShabadPane multiPaneId={2} />
        </div>
        <div className="shabad3-container">
          <ShabadPane multiPaneId={3} />
        </div>
      </div>
    );
  } else {
    controllerMarkup = (
      <div className="navigator-row">
        <ShabadPane />
        <MiscPane
          waheguruSlide={displayWaheguruSlide}
          moolMantraSlide={displayMoolMantraSlide}
          blankSlide={displayBlankViewer}
          anandSahibBhog={displayAnandSahibBhog}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={
          currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY')
            ? 'single-display-viewer'
            : 'navigator-row'
        }
      >
        {currentWorkspace !== i18n.t('WORKSPACES.SINGLE_DISPLAY') && <SearchPane />}
        <ViewerPane />
      </div>
      {controllerMarkup}
    </>
  );
};

export default Navigator;
