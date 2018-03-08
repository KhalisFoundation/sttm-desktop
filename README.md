SikhiToTheMax Desktop App
=========================

[![Build Status](https://api.travis-ci.org/KhalisFoundation/sttm-desktop.svg?branch=release)](https://travis-ci.org/KhalisFoundation/sttm-desktop) [![Build Status](https://ci.appveyor.com/api/projects/status/github/khalisfoundation/sttm-desktop?branch=release&svg=true)](https://ci.appveyor.com/project/navdeepsinghkhalsa/sttm-desktop)

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
