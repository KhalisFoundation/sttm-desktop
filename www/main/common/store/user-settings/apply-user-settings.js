export const applyUserSettings = (savedSettings) => {
  if (typeof localStorage === 'object') {
    localStorage.setItem('userSettings', JSON.stringify(savedSettings));
  }
  if (document) {
    Object.keys(savedSettings).forEach((key) => {
      if (typeof savedSettings[key] !== 'object') {
        try {
          document.body.classList.add(`${key}-${savedSettings[key]}`);
        } catch (_) {
          // a value that is not a valid class token (spaces); the other settings still apply
        }
      }
    });
  }
};
