import React from 'react';
// Custom components
import SearchInputs from './SearchInputs';
import SearchOptions from './SearchOptions';

export default () => (
  <div id="main-ui" className="base-ui">
    <div className="nav-page active" id="search-page">
      <div className="navigator-header">
        <div className="preferences-open" />
        <div className="toggle-minimize">
          <i className="fa fa-window-minimize" />
          <i className="fa fa-window-maximize disabled" />
        </div>
        <span className="nav-header-text">Search</span>
        <div id="search-type" />
      </div>
      <div className="search-div">
        <SearchInputs />
        <SearchOptions />
      </div>
      <section className="block-list">
        <ul id="results" className="gurmukhi" />
      </section>
    </div>
    <div className="nav-page" id="session-page">
      <div className="navigator-header navigator-header-tabs">
        <div className="preferences-open" />
        <div className="toggle-minimize">
          <i className="fa fa-window-minimize" />
          <i className="fa fa-window-maximize disabled" />
        </div>
        <span className="nav-header-text"> </span>
        <div className="nav-header-tabs">
          <span
            className="nav-header-tab nav-header-text active"
            id="history-tab"
            data-title="history"
          >
            <i className="fa fa-clock-o" />
            History
          </span>
          <span className="nav-header-tab nav-header-text" id="themes-tab" data-title="themes">
            <i className="fa fa-paint-brush" />
            Themes
          </span>
          <span className="nav-header-tab nav-header-text" id="insert-tab" data-title="insert">
            <i className="fa fa-desktop" />
            Insert
          </span>
          <span className="nav-header-tab nav-header-text" id="settings-tab" data-title="settings">
            <i className="fa fa-cogs" />
            Settings
          </span>
          <span className="nav-header-tab nav-header-text" id="others-tab" data-title="others">
            <i className="fa fa-ellipsis-h" />
            Others
          </span>
        </div>
      </div>
      <section className="block-list">
        <div className="tab-content active" id="history-tab-content">
          <ul id="session" className="gurmukhi" />
        </div>
        <div className="tab-content" id="themes-tab-content">
          <ul className="options-list" id="custom-theme-options" />
        </div>
        <div className="tab-content" id="insert-tab-content">
          <ul id="list-of-custom-slides" />
        </div>
        <div className="tab-content" id="settings-tab-content" />
        <div className="tab-content" id="others-tab-content">
          <ul id="list-of-shabad-options" />
        </div>
      </section>
    </div>
    <div className="nav-page" id="shabad-page" tabIndex="0">
      <div className="navigator-header">
        <div className="preferences-open" />
        <div className="toggle-minimize">
          <i className="fa fa-window-minimize" />
          <i className="fa fa-window-maximize disabled" />
        </div>
        <div className="current-shabad-header">
          <div className="shabad-prev" />
          <span className="nav-header-text">Current Shabad</span>
          <div className="shabad-next" />
        </div>
        <div id="current-shabad-menu" />
      </div>
      <section className="block-list">
        <ul id="shabad" className="gurmukhi" />
      </section>
    </div>
    <div className="takeover-page" id="menu-page">
      <div className="navigator-header">
        <div className="preferences-close" />
        <div className="toggle-minimize">
          <i className="fa fa-window-minimize" />
          <i className="fa fa-window-maximize disabled" />
        </div>
        <span className="nav-header-text">Settings</span>
      </div>
    </div>
  </div>
);
