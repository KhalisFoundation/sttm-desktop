import React from 'react';
import PropTypes from 'prop-types';

const remote = require('@electron/remote');

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 250;
// How long a remounted subtree has to survive before its retry budget is
// refilled. It only has to outlast the commit that follows a retry: an error
// thrown from an effect arrives immediately after that commit, so anything
// beyond one frame separates a real recovery from a subtree that is still
// failing. The margin above that is for a child that does asynchronous work
// before it throws.
const HEALTHY_MS = 1000;
// Roll the crash log over at this size, keeping one previous generation, so an
// Akhand Paatth left running for days cannot fill the user's disk with a fault
// that recurs. Post-mortems want the most recent entries, so the newest
// generation is the live file and the older one is what gets discarded.
const MAX_CRASH_LOG_BYTES = 512 * 1024;

/**
 * A render error anywhere in a renderer (the navigator or the viewer deck)
 * otherwise unmounts the whole React tree and leaves a blank window. This
 * boundary limits the failure to its subtree, records the error and component
 * stack, and attempts a bounded number of remounts before showing a fallback.
 * A remount gives the child tree another opportunity to render from current
 * state without assuming a cause for the error.
 *
 * A caught error unmounts the subtree, so the deck loses its scroll state and
 * remounts fresh. `akhandpatt/reading-position` holds the position in module
 * state, so a fault caught by the viewer's own boundary resumes in place. A
 * fault caught by the navigator's boundary recreates the `<webview>` that hosts
 * the preview deck, which reloads `viewer.html` into a new JavaScript context
 * and loses that module state, so the reading restarts from the operator's last
 * selection. That is still a recovery: without a boundary a render fault in
 * either renderer leaves a blank window and no reading at all.
 *
 * The crash log is written to `sttm-crash.log` under the app's userData dir so
 * issues that only reproduce on a user's machine can still be diagnosed.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
    this.retryTimer = null;
    this.healthyTimer = null;
  }

  static clearTimer(handle) {
    if (handle) {
      clearTimeout(handle);
    }
    return null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const { label } = this.props;
    const { retryCount } = this.state;
    const componentStack = info && info.componentStack ? info.componentStack : '';

    // React already prints the error; add the labelled component stack so the
    // failing subtree is unambiguous in the console and the persisted log.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${label}]`, error, componentStack);
    ErrorBoundary.persist(label, error, componentStack);

    // Remount the children before showing the fallback, but cap the attempts so
    // a render that keeps failing cannot loop. A fault arriving now means the
    // previous remount did not recover, so any pending budget refill is void.
    this.healthyTimer = ErrorBoundary.clearTimer(this.healthyTimer);

    if (retryCount < MAX_AUTO_RETRIES) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
        }));
      }, RETRY_DELAY_MS);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { hasError, retryCount } = this.state;
    // A retry has committed without throwing, but that is not yet a recovery:
    // React runs effects after the commit, so an effect that throws every time
    // would arrive just after this point. Refilling the budget here would hand
    // such a subtree an unlimited supply of retries and it would remount several
    // times a second for as long as the fault persisted. Waiting instead until
    // the subtree has stayed up for `HEALTHY_MS` keeps the cap meaningful for
    // effects while still forgiving faults that are genuinely far apart, which
    // matters for a session left running for a whole programme.
    if (prevState.hasError && !hasError && retryCount > 0) {
      this.healthyTimer = ErrorBoundary.clearTimer(this.healthyTimer);
      this.healthyTimer = setTimeout(() => {
        this.healthyTimer = null;
        this.setState({ retryCount: 0 });
      }, HEALTHY_MS);
    }
  }

  componentWillUnmount() {
    this.retryTimer = ErrorBoundary.clearTimer(this.retryTimer);
    this.healthyTimer = ErrorBoundary.clearTimer(this.healthyTimer);
  }

  static persist(label, error, componentStack) {
    try {
      // eslint-disable-next-line global-require
      const fs = require('fs');
      // eslint-disable-next-line global-require
      const path = require('path');
      const logPath = path.join(remote.app.getPath('userData'), 'sttm-crash.log');
      const entry = `\n[${new Date().toISOString()}] [${label}] ${
        error && error.stack ? error.stack : error
      }\nComponent stack:${componentStack}\n`;
      if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_CRASH_LOG_BYTES) {
        fs.renameSync(logPath, `${logPath}.1`);
      }
      fs.appendFile(logPath, entry, () => {});
    } catch (e) {
      // Never let logging failures compound the original error.
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] failed to persist crash log', e);
    }
  }

  render() {
    const { hasError, error, retryCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError && retryCount >= MAX_AUTO_RETRIES) {
      if (fallback) {
        return fallback;
      }
      return (
        <div className="error-boundary-fallback">
          <p>Something went wrong displaying this content.</p>
          {error && error.message ? <pre>{error.message}</pre> : null}
        </div>
      );
    }

    // While under the retry cap, render nothing until the timer remounts the
    // children.
    if (hasError) {
      return null;
    }

    return children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  fallback: PropTypes.node,
  label: PropTypes.string,
};

ErrorBoundary.defaultProps = {
  label: 'app',
};

export default ErrorBoundary;
