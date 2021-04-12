export const applyUserSettings = savedSettings => {
  if (typeof localStorage === 'object') {
    localStorage.setItem('userSettings', JSON.stringify(savedSettings));
  }
  if (document) {
    Object.keys(savedSettings).forEach(key => {
      if (typeof savedSettings[key] !== 'object') {
        document.body.classList.add(`${key}-${savedSettings[key]}`);
      }
    });
  }
};
