/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const packageJson = require('../package.json');

// Exit gracefully if not on macOS
if (process.platform !== 'darwin') {
  console.log('Skipping package.json update - not on macOS platform');
  process.exit(0);
}

const teamId = process.env.APPLE_TEAM_ID;

if (!teamId) {
  console.error('TEAM_ID is not defined in the environment variables');
  process.exit(0);
}

packageJson.build.mac.notarize.teamId = teamId;

fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
console.log('package.json has been updated with the APPLE_TEAM_ID');
