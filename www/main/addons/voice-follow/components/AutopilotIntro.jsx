import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { i18n } from '../../../common/i18n';

// First-launch callout for the Voice Autopilot tab: shown once per computer (bump the version to
// show it again after a big change). Start opens the tab; Not now just hides it.
const INTRO_VERSION = 1;
const KEY = 'vfIntroSeen';

const seen = () => {
  try {
    return Number(localStorage.getItem(KEY)) >= INTRO_VERSION;
  } catch (e) {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, String(INTRO_VERSION));
  } catch (e) {
    /* ignore */
  }
};

const AutopilotIntro = ({ onStart }) => {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const close = () => {
    markSeen();
    setOpen(false);
  };
  return (
    <div className="vf-intro" role="dialog" aria-label={i18n.t('VOICE_FOLLOW.INTRO_TITLE')}>
      <div className="vf-intro-arrow" />
      <div className="vf-intro-title">{i18n.t('VOICE_FOLLOW.INTRO_TITLE')}</div>
      <div className="vf-intro-desc">{i18n.t('VOICE_FOLLOW.INTRO_DESC')}</div>
      <div className="vf-intro-actions">
        <button
          type="button"
          className="vf-intro-start"
          onClick={() => {
            close();
            onStart();
          }}
        >
          {i18n.t('VOICE_FOLLOW.INTRO_START')}
        </button>
        <button type="button" className="vf-intro-later" onClick={close}>
          {i18n.t('VOICE_FOLLOW.INTRO_LATER')}
        </button>
      </div>
    </div>
  );
};

AutopilotIntro.propTypes = {
  onStart: PropTypes.func.isRequired,
};

export default AutopilotIntro;
