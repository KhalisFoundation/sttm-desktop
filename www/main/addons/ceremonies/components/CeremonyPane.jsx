import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

import { Switch, Tile } from '../../../common/sttm-ui';
import { ceremoniesFilter } from '../../../common/constants';

import { getUserPreferenceFor, loadCeremonyGlobal } from '../utils';

const { store, i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');
const { getTheme, getCurrentTheme, applyTheme } = require('../../../theme_editor');

const CeremonyPane = props => {
  const { token, name, id, onScreenClose } = props;
  const paneId = token;
  const [currentCeremony, setCurrentCeremony] = useState(id);

  const loadCeremony = () => {
    analytics.trackEvent('ceremony', token);
    loadCeremonyGlobal(currentCeremony);
    onScreenClose();
  };

  const onThemeClick = theme => {
    loadCeremony();
    applyTheme(theme);
  };

  const toggleOptions = (toggleType, toggleVar) => {
    store.setUserPref(`gurbani.ceremonies.ceremony-${token}-${toggleType}`, toggleVar);
    global.platform.updateSettings();
    const ceremonyToLoad = toggleType === 'rm' ? ceremoniesFilter.raagmalaMap[id] : id;
    loadCeremonyGlobal(ceremonyToLoad);
    // make sure when clicked on theme, the rm version is loaded
    setCurrentCeremony(ceremonyToLoad);
  };

  const toggleEnglishExplainations = isEnglishExplainations => {
    toggleOptions('english', isEnglishExplainations);
  };

  const toggleRm = isRm => {
    toggleOptions('rm', isRm);
  };

  const themes = {
    light: getTheme('light-theme'),
    anandkaraj: getTheme('floral'),
    anand: getTheme('a-new-day'),
    akbhogrm: getTheme('khalsa-gold'),
    current: getCurrentTheme(),
  };

  return (
    <div className="ceremony-pane" id={paneId}>
      <header className="toolbar-nh navigator-header">
        <span className="gurmukhi">{name}</span>
      </header>
      <div className="ceremony-pane-content">
        <div className="ceremony-pane-options" id={`cpo-${paneId}`}>
          {ceremoniesFilter.englishToggle.includes(id) && (
            <Switch
              onToggle={toggleEnglishExplainations}
              value={getUserPreferenceFor('english', token)}
              title={i18n.t('TOOLBAR.ENG_EXPLANATIONS')}
              controlId={`${name}-english-exp-toggle`}
              className={`${name}-english-exp-switch`}
            />
          )}

          {ceremoniesFilter.raagmalaToggle.includes(id) && (
            <Switch
              onToggle={toggleRm}
              value={getUserPreferenceFor('rm', token)}
              title={i18n.t('TOOLBAR.RAAGMALA')}
              controlId={`${name}-rm-toggle`}
              className={`${name}-rm-switch`}
            />
          )}

          <div className="ceremony-pane-themes">
            <div className="ceremony-theme-header"> {i18n.t('TOOLBAR.CHOOSE_THEME')} </div>

            <Tile
              onClick={() => {
                onThemeClick(themes.light);
              }}
              className="theme-instance"
              theme={themes.light}
            >
              LIGHT
            </Tile>

            <Tile
              onClick={() => {
                onThemeClick(themes[token]);
              }}
              className="theme-instance"
              theme={themes[token]}
            >
              {themes[token].name.replace(/_/g, ' ')}
            </Tile>

            <Tile
              onClick={() => {
                onThemeClick(themes.current);
              }}
              className="theme-instance"
              theme={themes.current}
            >
              CURRENT THEME
            </Tile>
          </div>
        </div>
      </div>
    </div>
  );
};

CeremonyPane.propTypes = {
  onScreenClose: PropTypes.func,
  id: PropTypes.number,
  name: PropTypes.string,
  token: PropTypes.string,
};

export default CeremonyPane;
