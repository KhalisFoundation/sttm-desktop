const ip = require('ip');
const remote = require('@electron/remote');

const getOverlayUrl = () => {
  const overlayPort = remote.getGlobal('overlayPort');
  const host = ip.address();
  return `http://${host}:${overlayPort}/`;
};

export default getOverlayUrl;
