SikhiToTheMax Desktop App
=========================

##Prerequisites
 1. Node - [https://nodejs.org/en/download/]()
 2. yarn - [https://yarnpkg.com/en/docs/install]()
 3. Have the Developer ID certificate for Khalis Foundation installed from Apple Developer Console
 4. pageant on Windows for SSH access to remote server
 5. AWS S3 keys

##Installation
 * Clone repository
 * Run `git submodule update --init --recursive` after you `cd` into the repository
 * Run `git checkout -t origin/dev` in the repository root and the www folder
 * Run `yarn` in the repository root and www folder
 * Depending on your current operating system, run `yarn run pack:win` or `yarn run pack:mac` to rebuild the native plugins for your system

##Configuration
###Uploading to Remote
Create file packaging/aws.json using packaging/aws-sample.json and fill out AWS information

###Updating remote version file for automatic updates
Create file packaging/keys.json using packaging/keys-sample.json and enter location of private key for SSH access to remote server where version number will be stored

##Running
 * Run `yarn start` in the repository root

##Packaging
 * Run `yarn run dist:osx` on macOS or `yarn run dist:win` on Windows to create and upload the app
