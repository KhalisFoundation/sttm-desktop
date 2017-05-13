/* eslint no-console: "off", import/no-extraneous-dependencies: 0 */
// Load the SDK
const AWS = require('aws-sdk');
const fs = require('fs');
const { version } = require('../package.json');
const path = require('path');
const SSH = require('ssh2').Client;

const buildsDir = path.join('./', 'builds');
const exeFile = `SikhiToTheMaxSetup-${version}.exe`;
const updateFile = 'latest.yml';
const bucketName = 'sttm-releases';
const remoteDir = 'win-x64/';

AWS.config.update({ region: 'us-west-2' });
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: { Bucket: bucketName },
});

function updateRemoteVersion() {
  const conn = new SSH();
  conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec(`echo ${version} > /home/releases/sttm-win-x64 && cat /home/releases/sttm-win-x64`, (err, stream) => {
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
    privateKey: fs.readFileSync(process.env.priv_key_file),
  });
}

function upload(files) {
  const file = files.splice(0, 1)[0];
  fs.readFile(path.join(buildsDir, file), (err, data) => {
    if (err) { throw err; }

    console.log(`Uploading ${file} ...`);
    const request = s3.upload({
      Key: remoteDir + file,
      Body: data,
      ACL: 'public-read',
    }, () => {
      console.log(`Successfully uploaded ${file}`);
      if (files.length > 0) {
        upload(files);
      } else {
        updateRemoteVersion();
      }
    });
    request.on('httpUploadProgress', (evt) => {
      console.log(`Uploaded :: ${(parseInt(evt.loaded, 10) * 100) / parseInt(evt.total, 10)}%`);
    });
  });
}

upload([exeFile, updateFile]);
