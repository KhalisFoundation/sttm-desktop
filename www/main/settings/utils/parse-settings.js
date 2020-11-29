const settingsJson = require('../../../configs/user-settings.json');

const { categories, settings } = settingsJson;

const filterObject = (obj, filter, filterValue) =>
  Object.keys(obj).reduce(
    (acc, val) =>
      obj[val][filter] !== filterValue
        ? acc
        : {
            ...acc,
            [val]: obj[val],
          },
    {},
  );

const settingsObjGenerator = () => {
  const settingsNewObj = {};
  Object.keys(categories).forEach(category => {
    if (categories[category].type === 'title') {
      settingsNewObj[category] = categories[category];
      settingsNewObj[category].subCatObjs = {};
      categories[category].subcategories.forEach(subCategory => {
        settingsNewObj[category].subCatObjs[subCategory] = categories[subCategory];
        settingsNewObj[category].subCatObjs[subCategory].settingObjs = {};
        settingsNewObj[category].subCatObjs[subCategory].settings.forEach(setting => {
          settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting] = settings[setting];
          if (subCategory === 'font-sizes') {
            let addon;
            if (setting === 'translation-font-size') {
              addon = settings['translation-visibility'];
            } else if (setting === 'transliteration-font-size') {
              addon = settings['transliteration-visibility'];
            } else if (setting === 'teeka-font-size') {
              addon = settings['teeka-visibility'];
            }
            settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting].addon = addon;
          }
          const subCat = settingsNewObj[category].subCatObjs[subCategory];
          if (subCat.type === 'range') {
            const { max, min, step, type } = subCat;
            subCat.settingObjs[setting].max = max;
            subCat.settingObjs[setting].min = min;
            subCat.settingObjs[setting].step = step;
            subCat.settingObjs[setting].type = subCat.settingObjs[setting].type || type;
          }
        });
      });
    }
  });
  return settingsNewObj;
};

export const settingsObj = settingsObjGenerator();

export const settingsNavObj = filterObject(categories, 'type', 'title');
