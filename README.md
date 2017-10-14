SikhiToTheMax Desktop App
=========================

[![Build Status](https://api.travis-ci.org/KhalisFoundation/sttm-desktop.svg?branch=release)](https://travis-ci.org/KhalisFoundation/sttm-desktop) [![Build Status](https://ci.appveyor.com/api/projects/status/github/khalisfoundation/sttm-desktop?branch=release&svg=true)](https://ci.appveyor.com/project/navdeepsinghkhalsa/sttm-desktop)

## Prerequisites
 1. Node - [https://nodejs.org/en/download/]()
 2. yarn - [https://yarnpkg.com/en/docs/install]()
 
## Installation
 * Clone repository
 * Run `git submodule update --init --recursive` after you `cd` into the repository
 * Run `git checkout -t origin/dev` in the repository root and the www folder
 * Run `yarn install` in the repository root
 * Run `yarn rebuild` to rebuild the native plugins for your system

## Running
 * Run `yarn start` in the repository root

## Packaging
 * Run `yarn pack:osx` on macOS or `yarn pack:win` and `yarn pack:win32` on Windows to create the app setup and update files
