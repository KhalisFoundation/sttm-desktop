SikhiToTheMax Desktop App
=========================

<<<<<<< HEAD
<<<<<<< HEAD
[![Build Status](https://api.travis-ci.org/KhalisFoundation/sttm-desktop.svg?branch=release)](https://travis-ci.org/KhalisFoundation/sttm-desktop) [![Build Status](https://ci.appveyor.com/api/projects/status/github/khalisfoundation/sttm-desktop?branch=release&svg=true)](https://ci.appveyor.com/project/navdeepsinghkhalsa/sttm-desktop)
=======
## Prerequisites
 1. Node - [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
 2. yarn - [https://yarnpkg.com/en/docs/install](https://yarnpkg.com/en/docs/install)
 3. Have the Developer ID certificate for Khalis Foundation installed from Apple Developer Console
 4. pageant on Windows for SSH access to remote server
 5. AWS S3 keys
 6. macOS
   * Distribution provision profile in app root directory for Mac App Store
 7. Windows
   * Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables with the .p12 path and decryption password respectively
>>>>>>> KhalisFoundation/master
=======
[![Build Status](https://api.travis-ci.org/KhalisFoundation/sttm-desktop.svg?branch=release)](https://travis-ci.org/KhalisFoundation/sttm-desktop) [![Build Status](https://ci.appveyor.com/api/projects/status/github/khalisfoundation/sttm-desktop?branch=release&svg=true)](https://ci.appveyor.com/project/navdeepsinghkhalsa/sttm-desktop)
>>>>>>> KhalisFoundation/dev

## Prerequisites
 1. [Node](https://nodejs.org/en/download/)
 2. [Github SSH Key Setup](https://help.github.com/articles/connecting-to-github-with-ssh/)

## Installation
 * Clone repository
 * Run `npm install` in the repository root

## Running
 * Run `npm start` in the repository root

## Packaging

Create the app package for your system:

 * **macOS** - Run `npm run pack:osx`
 * **Windows 64-bit** - Run `npm run pack:win`
 * **Windows 32-bit** - Run `npm run pack:win32`
 * **Linux/Ubuntu 64-bit** - Run `npm run pack:linux`

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md)
