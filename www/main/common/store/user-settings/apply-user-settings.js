export const applyUserSettings = savedSettings => {
  if (typeof localStorage === 'object') {
    localStorage.setItem('userSettings', JSON.stringify(savedSettings));
  }
  if (document) {
    Object.keys(savedSettings).forEach(key => {
      document.body.classList.add(`${key}-${savedSettings[key]}`);
      console.log('adding class', `${key}-${savedSettings[key]}`);
    });
  }
};
