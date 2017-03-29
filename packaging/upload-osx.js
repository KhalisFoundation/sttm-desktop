/* eslint no-console: "off" */
// Load the SDK
// eslint-disable-next-line import/no-extraneous-dependencies
const AWS = require('aws-sdk');
const fs = require('fs');
const version = require('../package.json').version;

const buildsDir = './builds/';
const dmgFile = `SikhiToTheMax-${version}.dmg`;
const zipFile = `sttme-${version}.zip`;
const bucketName = 'sttm-releases';
const remoteDir = 'darwin/';

AWS.config.loadFromPath('./packaging/aws.json');
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: { Bucket: bucketName },
});

function upload(files) {
  const file = files.splice(0, 1);
  fs.readFile(buildsDir + file, (err, data) => {
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
      }
    });
    request.on('httpUploadProgress', (evt) => {
      console.log(`Uploaded :: ${(parseInt(evt.loaded, 10) * 100) / parseInt(evt.total, 10)}%`);
    });
  });
}

upload([dmgFile, zipFile]);
