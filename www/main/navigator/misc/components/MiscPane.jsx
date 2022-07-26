import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ipcRenderer } from 'electron/renderer';
import { useStoreState } from 'easy-peasy';

import Pane from '../../../common/sttm-ui/pane/Pane';
import { DataLayer } from '../state-manager/DataLayer';
import reducer, { initialState } from '../state-manager/reducer';
import { MiscContent } from './MiscContent';
import { MiscFooter } from './MiscFooter';
import { MiscHeader } from './MiscHeader';

export const MiscPane = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const paneRef = React.createRef();
  const { isSingleDisplayMode } = useStoreState(state => state.userSettings);
  const [isIntersecting, setIntersecting] = useState(false);

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Update our state when observer callback fires
      setIntersecting(entry.isIntersecting);
    }, { rootMargin: '0px' },
  );

  const footerComponent = () => (
    <MiscFooter
      waheguruSlide={waheguruSlide}
      moolMantraSlide={moolMantraSlide}
      blankSlide={blankSlide}
      anandSahibBhog={anandSahibBhog}
    />
  );

  useEffect(() => {
    if (paneRef.current) {
      observer.observe(paneRef.current);
    }
  }, []);

  useEffect(() => {
    if (isIntersecting) {
      const paneBound = paneRef.current.getBoundingClientRect();
      console.log(paneBound);
      const boundsObj = {
        x: paneBound.x,
        y: 50,
        width: paneBound.width,
        height: paneBound.height,
      }
      ipcRenderer.send('update-viewer-size', JSON.stringify(boundsObj));
      observer.unobserve(paneRef.current);
    }
  }, [isIntersecting]);

  return (
    <div className="misc-pane" ref={paneRef}>
      <DataLayer initialState={initialState} reducer={reducer}>
        <Pane header={MiscHeader} content={MiscContent} footer={footerComponent} />
      </DataLayer>
    </div>
  );
};

MiscPane.propTypes = {
  waheguruSlide: PropTypes.func,
  moolMantraSlide: PropTypes.func,
  blankSlide: PropTypes.func,
  anandSahibBhog: PropTypes.func,
};
