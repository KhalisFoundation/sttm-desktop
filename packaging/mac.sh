#!/bin/bash
# exit when any command fails
set -ev

if [ "$TRAVIS_BRANCH" = "release" ] || [ "$TRAVIS_BRANCH" = "master" ] || [ "$TRAVIS_BRANCH" = "dev" ]; then
  GIT_TAG=$(git describe --abbrev=0 2>&1)
  RELEASE_VERSION=$(node packaging/check-version.js $TRAVIS_BRANCH $GIT_TAG)
  npm test
  npm run dist:mac
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
  git config --global push.default current
  git checkout ${TRAVIS_BRANCH}
  git tag $RELEASE_VERSION
  git push https://${GH_TOKEN}@github.com/stoplay/stoplay-ext.git --tags
  if [ "$TRAVIS_BRANCH" = "release" ]; then
    echo "should not echo"
    # node update-mac.js $TRAVIS_BRANCH
  fi
fi
