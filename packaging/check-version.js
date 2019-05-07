/* eslint-disable no-console, import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const semver = require('semver');
const packageJSON = require('../package.json');

const currentReleaseMain = packageJSON.version;
let currentRelease = currentReleaseMain;

module.exports = (branch, lastTag) => {
  const lastRelease = semver.valid(lastTag);

  const lastReleaseMain = semver.coerce(lastRelease);
  const lastReleasePrerelease = semver.prerelease(lastRelease);

  if (!semver.valid(currentReleaseMain)) {
    throw new Error(
      `Release version (${currentReleaseMain}) is not valid. Please check package.json`,
    );
  }

  if (branch === 'dev' || branch === 'master') {
    const track = branch === 'dev' ? 'alpha' : 'beta';
    // If the release version is the same and the last one was either an alpha or beta,
    // increment the prerelease version
    if (
      semver.eq(lastReleaseMain, currentReleaseMain) &&
      ((branch === 'dev' && lastReleasePrerelease[0] === 'alpha') ||
        (branch === 'master' && lastReleasePrerelease[0] === 'beta'))
    ) {
      currentRelease = semver.inc(lastRelease, 'prerelease');
    } else if (semver.gt(currentReleaseMain, lastReleaseMain)) {
      // If the release version is newer than the last one
      // start a new prerelease track for the release
      currentRelease = `${currentReleaseMain}-${track}.0`;
    } else {
      throw new Error('Release cannot be older than previous version');
    }

    packageJSON.version = currentRelease;
    packageJSON.productName = `${packageJSON.productName} ${track
      .charAt(0)
      .toUpperCase()}${track.slice(1)}`;
    packageJSON.build.mac.icon = `assets/STTM-${track}.icns`;
    packageJSON.build.win.icon = `assets/STTM-${track}.ico`;

    fs.writeFileSync(path.resolve(__dirname, '..', 'package.json'), JSON.stringify(packageJSON));
  }
  return currentRelease;
};
