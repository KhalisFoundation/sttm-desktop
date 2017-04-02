/* eslint no-console: "off", import/no-extraneous-dependencies: 0 */
const electronInstaller = require('electron-winstaller');
const path = require('path');
const version = require('../package.json').version;

const rootPath = path.join('./');
const buildDir = path.join(rootPath, 'builds');
const assetsDir = path.join(rootPath, 'assets');

const resultPromise = electronInstaller.createWindowsInstaller({
  appDirectory: path.join(buildDir, 'SikhiToTheMax-win32-x64'),
  outputDirectory: path.join(buildDir, 'SikhiToTheMax64'),
  authors: 'Khalis, Inc.',
  exe: 'SikhiToTheMax.exe',
  noMsi: true,
  setupExe: `SikhiToTheMaxSetup-${version}.exe`,
  setupIcon: path.join(assetsDir, 'STTME.ico'),
  loadingGif: path.join(assetsDir, 'sttm-install.gif'),
});

resultPromise.then(
  () => {
    console.log('Installer and update files created!\n');
  },
  (e) => {
    console.log(`No dice: ${e.message}`);
  });
