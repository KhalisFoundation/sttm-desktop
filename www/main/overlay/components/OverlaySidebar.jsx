import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import OverlaySettingsContainer from './OverlaySettingsContainer';
import { settingsObj } from '../utils/parse-overlay-options';
import { getDefaultSettings } from '../../common/store/user-settings/get-saved-overlay-settings';
import { convertToCamelCase } from '../../common/utils';
import { i18n } from '../../common/i18n';

export const OverlaySidebar = () => {
  const baniOverlayState = useStoreState((state) => state.baniOverlay);
  const baniOverlayActions = useStoreActions((state) => state.baniOverlay);

  const resetToDefaults = () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(i18n.t('BANI_OVERLAY.RESET_CONFIRM'))) return;
    const defaultSettings = getDefaultSettings();
    Object.keys(baniOverlayState).forEach((state) => {
      if (baniOverlayState[state] !== defaultSettings[state]) {
        baniOverlayActions[`set${convertToCamelCase(state, true)}`](defaultSettings[state]);
      }
    });
  };

  return (
    <aside className="overlay-sidebar">
      <div className="overlay-sections">
        <OverlaySettingsContainer settingsObj={settingsObj} variant="sidebar" />
      </div>
      <footer className="overlay-sidebar-footer">
        <button type="button" className="overlay-reset" onClick={resetToDefaults}>
          {i18n.t('BANI_OVERLAY.RESET_DEFAULTS')}
        </button>
      </footer>
    </aside>
  );
};
