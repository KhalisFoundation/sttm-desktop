import React from 'react';
import { useStoreState } from 'easy-peasy';

const Navigator = () => {
  const { isConnected } = useStoreState(state => state.baniController);

  return (
    <>
      <div id="main-ui" className="base-ui">
        <div className="nav-page" id="search-page">
          <div className="navigator-header">
            <div className="preferences-open"></div>
            <div className="toggle-minimize">
              <i className="fa fa-window-minimize"></i>
              <i className="fa fa-window-maximize disabled"></i>
            </div>
            <span className="nav-header-text" data-key="SEARCH"></span>
            <div id="search-type"></div>
          </div>
          <div className="search-div"></div>
          <section className="block-list">
            <ul id="results" className="gurmukhi"></ul>
          </section>
        </div>
        <div className="nav-page" id="session-page">
          <div className="navigator-header navigator-header-tabs">
            <div className="preferences-open"></div>
            <div className="toggle-minimize">
              <i className="fa fa-window-minimize"></i>
              <i className="fa fa-window-maximize disabled"></i>
            </div>
            <span className="nav-header-text"> </span>
            <div className="nav-header-tabs">
              <span
                className="nav-header-tab nav-header-text active"
                id="history-tab"
                data-title="history"
              >
                <i className="fa fa-clock-o"></i> <span data-key="HISTORY"></span>
              </span>
              <span className="nav-header-tab nav-header-text" id="themes-tab" data-title="themes">
                <i className="fa fa-paint-brush"></i> <span data-key="THEMES"></span>
              </span>
              <span className="nav-header-tab nav-header-text" id="insert-tab" data-title="insert">
                <i className="fa fa-desktop"></i> <span data-key="INSERT"></span>
              </span>
              <span
                className="nav-header-tab nav-header-text"
                id="settings-tab"
                data-title="settings"
              >
                <i className="fa fa-cogs"></i> <span data-key="SETTINGS"></span>
              </span>
              <span className="nav-header-tab nav-header-text" id="others-tab" data-title="others">
                <i className="fa fa-ellipsis-h"></i> <span data-key="OTHERS"></span>
              </span>
            </div>
          </div>
          <section className="block-list">
            <div className="tab-content active" id="history-tab-content">
              <ul id="session" className="gurmukhi"></ul>
            </div>
            <div className="tab-content" id="themes-tab-content">
              <ul className="options-list" id="custom-theme-options"></ul>
            </div>
            <div className="tab-content" id="insert-tab-content">
              <ul id="list-of-custom-slides"></ul>
            </div>
            <div className="tab-content" id="settings-tab-content"></div>
            <div className="tab-content" id="others-tab-content">
              <ul id="list-of-shabad-options"></ul>
            </div>
          </section>
        </div>
        <div className="nav-page" id="shabad-page" tabIndex="0">
          <div className="navigator-header">
            <div className="preferences-open"></div>
            <div className="toggle-minimize">
              <i className="fa fa-window-minimize"></i>
              <i className="fa fa-window-maximize disabled"></i>
            </div>
            <div className="current-shabad-header">
              <div className="shabad-prev"></div>
              <span className="nav-header-text" data-key="CURRENT_SHABAD"></span>
              <div className="shabad-next"></div>
            </div>
            <div id="current-shabad-menu"></div>
          </div>
          <section className="block-list">
            <ul id="shabad" className="gurmukhi"></ul>
          </section>
          {isConnected && (
            <div className="controller-signal" data-i18n="[title]IN_USE">
              <img alt="sync" src="assets/img/icons/sync.svg" />
            </div>
          )}
        </div>
        <div className="takeover-page" id="menu-page">
          <div className="navigator-header">
            <div className="preferences-close"></div>
            <div className="toggle-minimize">
              <i className="fa fa-window-minimize"></i>
              <i className="fa fa-window-maximize disabled"></i>
            </div>
            <span className="nav-header-text" data-key="SETTINGS"></span>
          </div>
        </div>
      </div>
      <div id="footer" className="base-ui">
        <div className="menu-group">
          <div className="menu-group-left"></div>
          <div className="presenter-switch"></div>
        </div>
      </div>
      <section className="shortcut-tray base-ui"></section>
    </>
  );
};

export default Navigator;
