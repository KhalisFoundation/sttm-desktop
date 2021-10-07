const ip = require('ip');
const electron = require('electron');

const { remote } = electron;

const getOverlayUrl = () => {
  const overlayPort = remote.getGlobal('overlayPort');
  const host = ip.address();
  return `http://${host}:${overlayPort}/`;
};

export default getOverlayUrl;
