// "Check this computer" — one quiet line under the mic picker in the Voice Autopilot panel (shown only
// while Voice Autopilot is not listening). Runs engine/hwcheck.js (~5-10 s), shows a one-line verdict
// against the minimum bar for the experimental build, and lets a tester copy the details for Slack.
// The last result is kept per computer (localStorage) and written to the diagnostics log, so a session
// with problems can be checked against the computer's own result.
import React, { useState } from 'react';
import PropTypes from 'prop-types';
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

// GPU mode (engine/gpu-mode.js): one more quiet line, only where the WebGPU provider exists.
// It starts on its own after a "below the minimum" check, or from this line; it is used only when
// its self-check passes.
const GpuMode = ({ progress, status, onToggle }) => {
  if (!status || !status.supported) return null;
  if (progress) {
    const pct = progress.step === 'download' ? Math.round((progress.share || 0) * 100) : null;
    return (
      <div className="vf-hw-detail">
        <i className="fa fa-circle-o-notch fa-spin" aria-hidden="true" />{' '}
        {pct != null && i18n.t('VOICE_FOLLOW.GPU_DOWNLOADING', { p: pct })}
        {progress.step === 'waiting' && i18n.t('VOICE_FOLLOW.GPU_WAITING')}
        {progress.step === 'check' && i18n.t('VOICE_FOLLOW.GPU_CHECKING')}
      </div>
    );
  }
  const { check } = status;
  let text = null;
  if (status.active) text = i18n.t('VOICE_FOLLOW.GPU_ON', { x: check ? check.speedup : '' });
  else if (status.wanted && check && !check.ok) text = i18n.t('VOICE_FOLLOW.GPU_NOT_USED');
  else if (status.wanted && status.error) text = i18n.t('VOICE_FOLLOW.GPU_FAILED');
  return (
    <div className="vf-hw-detail">
      {text && `${text} · `}
      <button type="button" className="vf-hw-link" onClick={onToggle}>
        {i18n.t(status.active ? 'VOICE_FOLLOW.GPU_TURN_OFF' : 'VOICE_FOLLOW.GPU_TRY')}
      </button>
    </div>
  );
};

GpuMode.propTypes = {
  progress: PropTypes.shape({ step: PropTypes.string, share: PropTypes.number }),
  status: PropTypes.shape({
    supported: PropTypes.bool,
    active: PropTypes.bool,
    wanted: PropTypes.string,
    error: PropTypes.string,
    check: PropTypes.shape({ ok: PropTypes.bool, speedup: PropTypes.number }),
  }),
  onToggle: PropTypes.func.isRequired,
};
GpuMode.defaultProps = { progress: null, status: null };

const ICON = { great: 'fa-check-circle', ok: 'fa-check', below: 'fa-exclamation-triangle' };

const HwCheck = () => {
  const [result, setResult] = useState(load);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gpu, setGpu] = useState(() => engine.gpu.status());
  const [gpuProgress, setGpuProgress] = useState(null);

  const gpuDone = (job) => {
    if (!job) return;
    job
      .then((st) => setGpu(st))
      .catch(() => setGpu(engine.gpu.status()))
      .finally(() => setGpuProgress(null));
  };
  const toggleGpu = () => {
    if (gpuProgress || running) return;
    if (gpu.active) {
      setGpu(engine.gpu.disable());
      return;
    }
    setGpuProgress({ step: 'download', share: 0 });
    gpuDone(engine.gpu.enable({ source: 'user', onProgress: setGpuProgress }));
  };

  const check = async () => {
    if (running || gpuProgress) return;
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
    // A computer below the minimum tries GPU mode once on its own (download + self-check).
    const job = engine.gpu.noteHwCheck(r, setGpuProgress);
    if (job) {
      setGpuProgress({ step: 'download', share: 0 });
      gpuDone(job);
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
        <GpuMode progress={gpuProgress} status={gpu} onToggle={toggleGpu} />
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
      <GpuMode progress={gpuProgress} status={gpu} onToggle={toggleGpu} />
    </div>
  );
};

export default HwCheck;
