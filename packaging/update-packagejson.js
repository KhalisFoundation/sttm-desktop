/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const packageJson = require('../package.json');
const aptabaseConfig = require('../config.prod.json');

// Exit gracefully if not on macOS
if (process.platform !== 'darwin') {
  console.log('Skipping package.json update - not on macOS platform');
  process.exit(0);
}

const teamId = process.env.APPLE_TEAM_ID;
const aptabaseKey = process.env.APTABASE_KEY;

if (!teamId) {
  console.error('TEAM_ID is not defined in the environment variables');
  process.exit(0);
}

if (!aptabaseKey) {
  console.error('APTABASE_KEY is not defined in the environment variables');
  process.exit(0);
}

packageJson.build.mac.notarize.teamId = teamId;
aptabaseConfig.APTABASE_KEY = aptabaseKey;

fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
fs.writeFileSync('./config.prod.json', JSON.stringify(aptabaseConfig, null, 2), 'utf-8');

console.log('package.json and config.prod.json have been updated');
