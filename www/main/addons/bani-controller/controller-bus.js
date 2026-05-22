// Loose coupling between non-controller code (save-to-history, HistoryPane,
// MiscFooter) and the active bani-controller socket.
//
// The bani controller registers the active socket + adminPin via setControllerBus
// when a session opens, and clears it when the session ends. Mutation sites then
// call broadcastHistory to publish events without needing to know whether a
// session is currently active.
//
// Backwards-compatible: every helper here is a no-op when no session is active.

let activeSocket = null;
let activeAdminPin = 0;

export const setControllerBus = (socket, adminPin) => {
  activeSocket = socket || null;
  activeAdminPin = parseInt(adminPin, 10) || 0;
};

export const clearControllerBus = () => {
  activeSocket = null;
  activeAdminPin = 0;
};

export const isControllerBusActive = () => Boolean(activeSocket);

export const broadcastHistory = (action, payload = {}) => {
  if (!activeSocket || !action) return;
  try {
    activeSocket.emit('data', {
      host: 'sttm-desktop',
      type: 'history',
      pin: activeAdminPin,
      action,
      ...payload,
    });
  } catch {
    // Swallow — desktop history mutations should never fail because of a
    // dropped socket.
  }
};
