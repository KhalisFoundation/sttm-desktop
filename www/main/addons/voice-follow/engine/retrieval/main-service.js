const { RetrievalClient } = require('./client');
const { createUtilityWorker } = require('./utility-worker');

const CHANNEL = 'voice-follow:canonical-retrieval';

// Register from the main process with the presenter's WebContents as the only
// allowed caller. Worker paths and database paths are owned here, never supplied
// by renderer messages. This service has no projection or database write API.
function registerRetrievalService({
  ipcMain,
  userData,
  isAllowed,
  createClient = () => new RetrievalClient(userData, { workerFactory: createUtilityWorker }),
}) {
  const sessions = new Map();
  const close = (entry) => {
    if (sessions.get(entry.sender.id) === entry) sessions.delete(entry.sender.id);
    entry.sender.removeListener('destroyed', entry.onGone);
    entry.sender.removeListener('render-process-gone', entry.onGone);
    entry.sender.removeListener('did-start-navigation', entry.onNavigation);
    return entry.client.dispose();
  };
  ipcMain.handle(CHANNEL, async (event, message) => {
    const { sender } = event;
    if (!isAllowed(sender) || event.senderFrame !== sender.mainFrame) {
      throw new Error('Canonical retrieval caller is not allowed');
    }
    const { operation, token, text, cap } = message || {};
    if (typeof token !== 'string' || token.length < 1 || token.length > 128) {
      throw new Error('Invalid canonical retrieval session');
    }
    let entry = sessions.get(sender.id);
    if (operation === 'open') {
      if (entry && entry.token === token) return entry.client.ready;
      // Disposal begins synchronously. Create the replacement without allowing
      // an await gap in which a late close/open can overwrite a newer owner.
      if (entry) close(entry).catch(() => {});
      const client = createClient();
      entry = { token, sender, client };
      entry.onGone = () => close(entry).catch(() => {});
      entry.onNavigation = (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) entry.onGone();
      };
      sessions.set(sender.id, entry);
      sender.once('destroyed', entry.onGone);
      sender.once('render-process-gone', entry.onGone);
      sender.on('did-start-navigation', entry.onNavigation);
      try {
        const ready = await client.ready;
        if (sessions.get(sender.id) !== entry)
          throw new Error('Canonical retrieval session changed');
        return ready;
      } catch (_) {
        const superseded = sessions.get(sender.id) !== entry;
        await close(entry).catch(() => {});
        // Stop/reload/replacement is expected. Returning a terminal marker
        // avoids Electron logging it as a failed IPC handler on every stop.
        if (superseded) return { closed: true };
        throw new Error('Canonical retrieval preparation failed');
      }
    }
    if (operation === 'close') {
      if (entry && entry.token === token) return close(entry);
      return null;
    }
    if (operation !== 'search' || !entry || entry.token !== token) {
      throw new Error('Canonical retrieval session is unavailable');
    }
    return entry.client.search(text, cap);
  });
  return {
    async dispose() {
      ipcMain.removeHandler(CHANNEL);
      await Promise.all([...sessions.values()].map((entry) => close(entry)));
    },
  };
}

module.exports = { registerRetrievalService, CHANNEL };
