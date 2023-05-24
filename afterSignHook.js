
const fs = require('fs');
const path = require('path');

const { notarize } = require('@electron/notarize');
module.exports = async function (params) {
    // Only notarize the app on Mac OS only.
    if (process.platform !== 'darwin') {
        return;
    }
    console.log('afterSign hook triggered', params);

    // Same appId in electron-builder.
    let appId = 'org.khalisfoundation.sttm';

    let appPath = path.join(params.appOutDir, `${params.packager.appInfo.productFilename}.app`);
    if (!fs.existsSync(appPath)) {
        throw new Error(`Cannot find application at: ${appPath}`);
    }

    console.log(`Notarizing ${appId} found at ${appPath}`);

    try {
        await notarize({
            tool: 'notarytool',
            appBundleId: appId,
            appPath: appPath,
            appleId: '',
            appleIdPassword: '',
            teamId: ''
        });
    } catch (error) {
        console.error(error);
    }

    console.log(`Done notarizing ${appId}`);
};