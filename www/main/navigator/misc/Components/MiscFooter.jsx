import { remote } from 'electron';
import React from 'react';

const { i18n } = remote.require('./app');

function MiscFooter() {
  return (
    <>
      <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}</button>
      <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.BLANK`)}</button>
      <button className="gurmukhi tray-item-icon">vwihgurU</button>
      <button className="tray-item-icon">{i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}</button>
    </>
  );
}

export default MiscFooter;
