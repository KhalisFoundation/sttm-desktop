import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import Pane from '../../common/sttm-ui/pane/Pane';
import ShabadHeader from './ShabadHeader';
import MultiPaneHeader from './MultiPaneHeader';
import MultiPaneContent from './MultiPaneContent';

const ShabadPane = ({
  className,
  multiPaneId = false,
  isProjection = false,
  projectionSource = false,
  style,
}) => {
  const { activePaneId } = useStoreState((state) => state.navigator);
  const { defaultPaneId } = useStoreState((state) => state.userSettings);
  const paneRef = useRef(null);
  const paneId = multiPaneId || defaultPaneId;

  useEffect(() => {
    // Report full pane size for Display 2 scale only. Do not change controller layout.
    // In multipane, only the live pane reports so scale tracks the active list box.
    if (!projectionSource || isProjection || !paneRef.current) return undefined;
    const livePaneId = activePaneId || defaultPaneId || 1;
    if (multiPaneId && multiPaneId !== livePaneId) return undefined;

    const reportPaneSize = () => {
      if (!paneRef.current) return;
      const { width, height } = paneRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        ipcRenderer.send('projection-viewport', { paneId, width, height });
      }
    };
    const observer = new ResizeObserver(reportPaneSize);
    observer.observe(paneRef.current);
    reportPaneSize();

    return () => observer.disconnect();
  }, [activePaneId, defaultPaneId, isProjection, multiPaneId, paneId, projectionSource]);

  return (
    <div ref={paneRef} style={style} className={`pane-container shabad-pane ${className || ''}`}>
      <Pane
        header={multiPaneId ? MultiPaneHeader : ShabadHeader}
        content={MultiPaneContent}
        data={{ multiPaneId: paneId, isProjection, projectionSource }}
        className={multiPaneId === activePaneId ? 'live-pane' : 'inactive-pane'}
      />
    </div>
  );
};

ShabadPane.propTypes = {
  className: PropTypes.string,
  multiPaneId: PropTypes.number,
  isProjection: PropTypes.bool,
  projectionSource: PropTypes.bool,
  style: PropTypes.object,
};
export default ShabadPane;
