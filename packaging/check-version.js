/* eslint-disable no-console, import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const semver = require('semver');
const packageJSON = require('../package.json');

const currentReleaseMain = packageJSON.version;
let currentRelease = currentReleaseMain;

// Branches that publish prerelease builds, mapped to their prerelease track
const PRERELEASE_TRACKS = {
  dev: 'alpha',
  master: 'beta',
  'experimental-release': 'experimental',
};

module.exports = (branch, lastTag) => {
  const lastRelease = semver.valid(lastTag);

  const lastReleaseMain = semver.coerce(lastRelease);
  const lastReleasePrerelease = semver.prerelease(lastRelease);

  if (!semver.valid(currentReleaseMain)) {
    throw new Error(
      `Release version (${currentReleaseMain}) is not valid. Please check package.json`,
    );
  }

  const track = PRERELEASE_TRACKS[branch];
  if (track) {
    // If the release version is the same and the last one was on this track,
    // increment the prerelease version
    if (
      lastReleaseMain &&
      semver.eq(lastReleaseMain, currentReleaseMain) &&
      lastReleasePrerelease &&
      lastReleasePrerelease[0] === track
    ) {
      currentRelease = semver.inc(lastRelease, 'prerelease');
    } else if (!lastReleaseMain || semver.gt(currentReleaseMain, lastReleaseMain)) {
      // If the release version is newer than the last one (or this track has no releases yet)
      // start a new prerelease track for the release
      currentRelease = `${currentReleaseMain}-${track}.0`;
    } else {
      throw new Error('Release cannot be older than previous version');
    }

    // The experimental track's name and icons are set by the release script
    if (track !== 'experimental') {
      packageJSON.version = currentRelease;
      packageJSON.productName = `${packageJSON.productName} ${track
        .charAt(0)
        .toUpperCase()}${track.slice(1)}`;
      packageJSON.build.mac.icon = `assets/STTM-${track}.icns`;
      packageJSON.build.win.icon = `assets/STTM-${track}.ico`;

      fs.writeFileSync(path.resolve(__dirname, '..', 'package.json'), JSON.stringify(packageJSON));
    }
  }
  return currentRelease;
};
