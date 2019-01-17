#!/bin/bash
# exit when any command fails
set -ev

if [ "$TRAVIS_BRANCH" = "release" ] || [ "$TRAVIS_BRANCH" = "master" ] || [ "$TRAVIS_BRANCH" = "dev" ]; then
  GIT_TAG=$(git describe --abbrev=0 2>&1)
  RELEASE_VERSION=$(node packaging/check-version.js $TRAVIS_BRANCH $GIT_TAG)
  npm test
  npm run dist:mac
  # git remote add origin https://$GH_TOKEN@github.com/khalisfoundation/sttm-desktop.git
  git tag $RELEASE_VERSION
  git push --tags
  if [ "$TRAVIS_BRANCH" = "release" ]; then
    echo "should not echo"
    # node update-mac.js $TRAVIS_BRANCH
  fi
fi
