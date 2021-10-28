export const settingsObjGenerator = obj => {
  const { categories, settings } = obj;

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
          const { addon } = settingsNewObj[category].subCatObjs[subCategory].settingObjs[setting];
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
  return settingsNewObj;
};
