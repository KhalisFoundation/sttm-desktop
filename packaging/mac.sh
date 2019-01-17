#!/bin/bash
# exit when any command fails
set -ev

echo $TRAVIS_BRANCH
if [ "$TRAVIS_BRANCH" = "release" ] || [ "$TRAVIS_BRANCH" = "master" ] || [ "$TRAVIS_BRANCH" = "dev" ]; then
  GIT_TAG=$(git describe --abbrev=0 2>&1)
  echo "GIT_TAG"
  echo $GIT_TAG
  RELEASE_VERSION=$(node check-version.js $TRAVIS_BRANCH $GIT_TAG)
  echo "RELEASE_VERSION"
  echo $RELEASE_VERSION
  # npm test
  # npm run dist:mac
  # git tag $RELEASE_VERSION
  # git push --tags
  # node update-mac.js $TRAVIS_BRANCH
else
  npm test;
fi
