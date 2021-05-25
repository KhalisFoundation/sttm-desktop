import { remote } from 'electron';
import React, { useState } from 'react';

const { i18n } = remote.require('./app');

function MiscFooter() {
  // For Global States
  // const setGlobalStates = useStoreActions(state => state.navigator);
  // For shortcut tray
  const [shortcutOpen, setShortcutOpen] = useState(true);
  const HandleChange = () => {
    setShortcutOpen(!shortcutOpen);
  };
  // Event Handlers
  const ClearHistory = () => {
    // setGlobalStates.setVersesHistory([]);
  };
  return (
    <div className="misc-footer">
      <div className="clear-pane">
        <div
          className={`${!shortcutOpen ? 'footer-toggler' : 'footer-toggler-inactive '}`}
          onClick={HandleChange}
        >
          <i className={`${shortcutOpen ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
        </div>
        <a className="clear-history" onClick={ClearHistory}>
          <i className="fa fa-history" />
          <span>Clear History</span>
        </a>
      </div>
      <div className={`${shortcutOpen ? 'shortcut-drawer-active' : 'shortcut-drawer'}`}>
        <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}</button>
        <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}</button>
        <button className="gurmukhi tray-item-icon">vwihgurU</button>
        <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.BLANK`)}</button>
      </div>
    </div>
  );
}

export default MiscFooter;
