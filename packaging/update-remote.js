/* eslint-disable no-console, import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const SSH = require('ssh2').Client;
const { version } = require('../package.json');

const files = {
  mac: 'sttm-mac-x64',
  win: 'sttm-win-x64',
  win32: 'sttm-win-ia32',
};

module.exports = platform => {
  const file = files[platform];
  const conn = new SSH();
  conn
    .on('ready', () => {
      console.log('Client :: ready');
      conn.exec(
        `echo ${version} > /home/releases/${file} && cat /home/releases/${file}`,
        (err, stream) => {
          if (err) throw err;
          stream
            .on('close', (code, signal) => {
              console.log(`Stream :: close :: code: ${code}, signal: ${signal}`);
              conn.end();
            })
            .on('data', data => {
              console.log(`STDOUT: ${data}`);
            })
            .stderr.on('data', data => {
              console.log(`STDERR: ${data}`);
            });
        },
      );
    })
    .connect({
      host: 'khalis.net',
      port: 1157,
      username: 'kns',
      privateKey: fs.readFileSync(path.resolve(__dirname, 'id_rsa')),
    });
};
