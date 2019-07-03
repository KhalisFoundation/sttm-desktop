import React from 'react';
import { useSelector } from 'react-redux';
// Custom components
import Footer from './Footer/Footer';
import MainUI from './MainUI/MainUI';
import Toolbar from './Toolbar/Toolbar';

export default () => {
  const { gurmukhiKB, rendererState } = useSelector(state => state);
  return (
    <div
      id="navigator"
      className={`noselect ${gurmukhiKB.open && rendererState.searchFocus ? 'kb-active' : ''}`}
    >
      <div className="focus-overlay hidden overlay-ui common-overlay" />
      <Toolbar />
      <MainUI />
      <Footer />
      <section className="shortcut-tray base-ui" />
    </div>
  );
};
