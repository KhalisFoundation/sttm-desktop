var electronInstaller = require('electron-winstaller');
var path = require('path');
const version = require("../package.json").version;

var rootPath = path.join('./');
var buildDir = path.join(rootPath, 'builds');
var assetsDir = path.join(rootPath, 'assets');

resultPromise = electronInstaller.createWindowsInstaller({
  appDirectory: path.join(buildDir, 'SikhiToTheMax-win32-x64'),
  outputDirectory: path.join(buildDir, 'SikhiToTheMax64'),
  authors: 'Khalis, Inc.',
  exe: 'SikhiToTheMax.exe',
  noMsi: true,
  setupExe: 'SikhiToTheMaxSetup-' + version + '.exe',
  setupIcon: path.join(assetsDir, 'STTME.ico'),
  loadingGif: path.join(assetsDir, 'sttm-install.gif')
});

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));
