// "Check this computer" — one quiet line under the mic picker in the Voice Autopilot panel (shown only
// while Voice Autopilot is not listening). Runs engine/hwcheck.js (~5-10 s), shows a one-line verdict
// against the minimum bar for the experimental build, and lets a tester copy the details for Slack.
// The last result is kept per computer (localStorage) and written to the diagnostics log, so a session
// with problems can be checked against the computer's own result.
import React, { useState } from 'react';
import { i18n } from '../../../common/i18n';

const engine = require('../engine');
const hwcheck = require('../engine/hwcheck');
const shadowBus = require('../shadow/bus');
const { diag } = require('../shadow/diag');
const { SHADOW_BUILD, VF_FEATURE_VERSION } = require('../shadow/config');

const KEY = 'vfHwCheck';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (_) {
    return null;
  }
};
const save = (r) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch (_) {
    /* best effort */
  }
};

const ICON = { great: 'fa-check-circle', ok: 'fa-check', below: 'fa-exclamation-triangle' };

const HwCheck = () => {
  const [result, setResult] = useState(load);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = async () => {
    if (running) return;
    setRunning(true);
    setCopied(false);
    const r = await hwcheck.run(engine);
    setRunning(false);
    setResult(r);
    save(r);
    const line = hwcheck.summary(r, VF_FEATURE_VERSION);
    try {
      diag(`hw check: ${line}`);
      if (SHADOW_BUILD && shadowBus.active()) shadowBus.note({ type: 'hw_check', ...r });
    } catch (_) {
      /* logging never blocks the panel */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hwcheck.summary(result, VF_FEATURE_VERSION));
      setCopied(true);
    } catch (_) {
      setCopied(false);
    }
  };

  if (running) {
    return (
      <div className="vf-hw">
        <i className="fa fa-circle-o-notch fa-spin" aria-hidden="true" />{' '}
        {i18n.t('VOICE_FOLLOW.HW_RUNNING')}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="vf-hw">
        <button type="button" className="vf-hw-link" onClick={check}>
          {i18n.t('VOICE_FOLLOW.HW_CHECK')}
        </button>
      </div>
    );
  }
  const verdict = result.error ? 'below' : result.verdict;
  const s = result.specs || {};
  const sp = hwcheck.speed(result);
  return (
    <div className={`vf-hw is-${verdict}`}>
      <div className="vf-hw-verdict">
        <i className={`fa ${ICON[verdict]}`} aria-hidden="true" />{' '}
        {result.error
          ? i18n.t('VOICE_FOLLOW.HW_FAILED')
          : i18n.t(`VOICE_FOLLOW.HW_${verdict.toUpperCase()}`)}
      </div>
      <div
        className="vf-hw-detail"
        title={`${s.cpu} · ${s.cores} cores · ${s.ramGb} GB · ${s.os} ${s.arch}`}
      >
        {!result.error && `${i18n.t(`VOICE_FOLLOW.${sp.key}`, sp.vars)} · `}
        <button type="button" className="vf-hw-link" onClick={copy}>
          {copied ? i18n.t('VOICE_FOLLOW.HW_COPIED') : i18n.t('VOICE_FOLLOW.HW_COPY')}
        </button>
        {' · '}
        <button type="button" className="vf-hw-link" onClick={check}>
          {i18n.t('VOICE_FOLLOW.HW_AGAIN')}
        </button>
      </div>
    </div>
  );
};

export default HwCheck;
