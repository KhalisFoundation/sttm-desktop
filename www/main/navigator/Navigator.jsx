import React from 'react';
import { useStoreState} from 'easy-peasy';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import { MiscPane } from './misc/components';
import ViewerPane from './viewer/ViewerPane';
import { Pane } from '../common/sttm-ui/pane';
import { singleDisplayContent, singleDisplayFooter, singleDisplayHeader } from './single-display';
import { useSlides } from '../common/hooks';

const Navigator = () => {
  const { isSingleDisplayMode } = useStoreState((state) => state.userSettings);
  const { minimizedBySingleDisplay } = useStoreState((state) => state.navigator);

  const { openWaheguruSlide, openMoolMantraSlide, openBlankViewer, openAnandSahibBhog } = useSlides();
  
  return (
    <>
      {isSingleDisplayMode ? (
        <>
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
            <MiscPane
              waheguruSlide={openWaheguruSlide}
              moolMantraSlide={openMoolMantraSlide}
              blankSlide={openBlankViewer}
              anandSahibBhog={openAnandSahibBhog}
            />
          </div>
        </>
      )}
    </>
  );
};

export default Navigator;
