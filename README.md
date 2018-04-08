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
 2. [yarn](https://yarnpkg.com/en/docs/install)
 3. [Github SSH Key Setup](https://help.github.com/articles/connecting-to-github-with-ssh/)
 
## Installation
 * Clone repository
 * Run `git submodule update --init --recursive` after you `cd` into the repository
 * Run `git checkout -t origin/dev` in the repository root and the www folder
 * Run `yarn install` in the repository root
 * Run `yarn rebuild` to rebuild the native plugins for your system

## Running
 * Run `yarn start` in the repository root

## Packaging

Create the app package for your system:

 * **macOS** - Run `yarn pack:osx`
 * **Windows 64-bit** - Run `yarn pack:win`
 * **Windows 32-bit** - Run `yarn pack:win32`
 * **Linux/Ubuntu 64-bit** - Run `yarn pack:linux`

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md)
