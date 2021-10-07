import { settingsObjGenerator } from '../../common/utils/settings-obj-generator';

const { sidebar, bottomBar } = require('../../../configs/overlay.json');

export const settingsObj = settingsObjGenerator(sidebar);
export const bottomSettings = settingsObjGenerator(bottomBar);
