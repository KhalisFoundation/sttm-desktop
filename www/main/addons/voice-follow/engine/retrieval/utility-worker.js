// Main-process transport. Realm initialization/teardown can abort a native Node
// worker thread; a utility process keeps that failure outside the presenter.
function createUtilityWorker(file, { workerData }, { fork } = {}) {
  // Lazy import keeps the transport testable in Node without booting Electron.
  // eslint-disable-next-line global-require
  const start = fork || require('electron').utilityProcess.fork;
  const child = start(file, [workerData.userData], {
    serviceName: 'Voice Follow canonical retrieval',
  });
  let stopped = false;
  let termination;
  let exitTimer;
  let resolveExit;
  let rejectExit;
  const exited = new Promise((resolve, reject) => {
    resolveExit = resolve;
    rejectExit = reject;
  });
  exited.catch(() => {});
  child.on('spawn', () => {
    if (stopped) child.kill();
  });
  child.once('exit', (code) => {
    clearTimeout(exitTimer);
    resolveExit(code);
  });
  child.terminate = () => {
    if (!termination) {
      stopped = true;
      termination = exited;
      exitTimer = setTimeout(
        () => rejectExit(new Error('Canonical retrieval process did not exit')),
        5000,
      );
      // A cancellation can precede spawn. The spawn listener retries then.
      child.kill();
      exited.then(
        () => clearTimeout(exitTimer),
        () => clearTimeout(exitTimer),
      );
    }
    return termination;
  };
  return child;
}

module.exports = { createUtilityWorker };
