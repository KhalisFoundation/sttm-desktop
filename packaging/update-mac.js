/* eslint no-console: "off", import/no-extraneous-dependencies: 0 */
const fs = require('fs');
const version = require('../package.json').version;
const path = require('path');
const SSH = require('ssh2').Client;

function updateRemoteVersion() {
  const conn = new SSH();
  conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec(`echo ${version} > /home/releases/sttm-mac-x64 && cat /home/releases/sttm-mac-x64`, (err, stream) => {
      if (err) throw err;
      stream.on('close', (code, signal) => {
        console.log(`Stream :: close :: code: ${code}, signal: ${signal}`);
        conn.end();
      }).on('data', (data) => {
        console.log(`STDOUT: ${data}`);
      }).stderr.on('data', (data) => {
        console.log(`STDERR: ${data}`);
      });
    });
  }).connect({
    host: 'khalis.net',
    port: 1157,
    username: 'kns',
    privateKey: fs.readFileSync(path.resolve(__dirname, 'id_rsa')),
  });
}

const branch = process.argv[2];
if (branch === 'release') {
  updateRemoteVersion();
}
