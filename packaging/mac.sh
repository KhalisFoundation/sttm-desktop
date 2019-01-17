#!/bin/bash
# exit when any command fails
set -ev

if [ "$TRAVIS_BRANCH" = "release" || "$TRAVIS_BRANCH" = "master" || "$TRAVIS_BRANCH" = "dev" ]; then
  git describe --abbrev=0
  GIT_TAG=$?
  echo "GIT_TAG"
  echo $GIT_TAG
  # node check-version.js $TRAVIS_BRANCH $GIT_TAG
  # RELEASE_VERSION=$?
  # npm test
  # npm run dist:mac
  # git tag $RELEASE_VERSION
  # git push --tags
  # node update-mac.js $TRAVIS_BRANCH
else
  npm test;
fi
