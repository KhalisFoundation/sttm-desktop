/* eslint-disable no-console */

require('dotenv').config();
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  // Get environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('Notarization credentials not found in environment variables');
    return;
  }

  console.log('Notarizing app...');
  await notarize({
    appBundleId: 'org.khalisfoundation.sttm',
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('Notarization complete!');
};
