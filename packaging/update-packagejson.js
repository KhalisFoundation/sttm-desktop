/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const packageJson = require('../package.json');
const prodConfig = require('../config.prod.json');

if (process.platform === 'darwin') {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) {
    console.error('APPLE_TEAM_ID is not defined in the environment variables');
    process.exit(0);
  }
  packageJson.build.mac.notarize.teamId = teamId;
  fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
}

const aptabaseKey = process.env.APTABASE_KEY;
const sentryDsn = process.env.SENTRY_DSN;
const audioTranscriptApi = process.env.AUDIO_TRANSCRIPT_API;
const audioTranscriptApiKey = process.env.AUDIO_TRANSCRIPT_API_KEY;

if (!aptabaseKey) {
  console.error('APTABASE_KEY is not defined in the environment variables');
  process.exit(0);
}

if (!sentryDsn) {
  console.error('SENTRY_DSN is not defined in the environment variables');
  process.exit(0);
}

if (!audioTranscriptApi) {
  console.error('AUDIO_TRANSCRIPT_API is not defined in the environment variables');
  process.exit(0);
}

if (!audioTranscriptApiKey) {
  console.error('AUDIO_TRANSCRIPT_API_KEY is not defined in the environment variables');
  process.exit(0);
}

prodConfig.APTABASE_KEY = aptabaseKey;
prodConfig.SENTRY_DSN = sentryDsn;
prodConfig.AUDIO_TRANSCRIPT_API = audioTranscriptApi;
prodConfig.AUDIO_TRANSCRIPT_API_KEY = audioTranscriptApiKey;

fs.writeFileSync('./config.prod.json', JSON.stringify(prodConfig, null, 2), 'utf-8');

console.log('package.json and config.prod.json have been updated');
