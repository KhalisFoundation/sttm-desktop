var electronInstaller = require('electron-winstaller');

resultPromise = electronInstaller.createWindowsInstaller({
  appDirectory: './builds/SikhiToTheMax-win32-x64',
  outputDirectory: './builds/SikhiToTheMax64',
  authors: 'Khalis, Inc.',
  exe: 'SikhiToTheMax.exe'
});

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));
