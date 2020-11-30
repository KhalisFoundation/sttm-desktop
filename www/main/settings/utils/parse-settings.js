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
  /* Create a hierarchical structure that would map to the DOM
     It would be like this
     Category 
      |___Subcategory
              |___Setting
                  |_____Addon
  */
  Object.keys(categories).forEach(category => {
    if (categories[category].type === 'title') {
      settingsNewObj[category] = categories[category];
      settingsNewObj[category].subCatObjs = {};
      categories[category].subcategories.forEach(subCategory => {
        settingsNewObj[category].subCatObjs[subCategory] = categories[subCategory];
        settingsNewObj[category].subCatObjs[subCategory].settingObjs = {};
        settingsNewObj[category].subCatObjs[subCategory].settings.forEach(setting => {
          settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting] = settings[setting];
          const addon = settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting].addon;
          if (addon) {
            settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting].addonObj =
              settings[addon];
          }
          const subCat = settingsNewObj[category].subCatObjs[subCategory];
          const { type } = subCat;
          if (type === 'range') {
            const { max, min, step } = subCat;
            subCat.settingObjs[setting].max = max;
            subCat.settingObjs[setting].min = min;
            subCat.settingObjs[setting].step = step;
          }
          subCat.settingObjs[setting].type = subCat.settingObjs[setting].type || type;
        });
      });
    }
  });
  console.log(settingsNewObj);
  return settingsNewObj;
};

export const settingsObj = settingsObjGenerator();

export const settingsNavObj = filterObject(categories, 'type', 'title');
