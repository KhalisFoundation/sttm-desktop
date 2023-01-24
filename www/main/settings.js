const remote = require('@electron/remote');

const settings = require('../configs/settings.json');

const { store } = remote.require('./app');

module.exports = {
  init() {
    this.applySettings();
  },

  applySettings(prefs = false) {
    const newUserPrefs = prefs || store.getAllPrefs();
    if (window.socket !== undefined && window.socket !== null) {
      window.socket.emit('data', {
        host: 'sttm-desktop',
        type: 'settings',
        settings: {
          fontSizes: store.getUserPref('slide-layout.font-sizes'),
        },
      });
    }
    Object.keys(settings).forEach((catKey) => {
      const cat = settings[catKey];
      Object.keys(cat.settings).forEach((settingKey) => {
        const setting = cat.settings[settingKey];
        switch (setting.type) {
          case 'checkbox':
          case 'switch':
            Object.keys(setting.options).forEach((option) => {
              if (newUserPrefs[catKey][settingKey][option]) {
                document.body.classList.add(option);
              } else {
                document.body.classList.remove(option);
              }
            });
            break;
          case 'radio':
            Object.keys(setting.options).forEach((optionToRemove) => {
              document.body.classList.remove(optionToRemove);
            });
            document.body.classList.add(newUserPrefs[catKey][settingKey]);
            break;

          case 'dropdown':
            Object.keys(setting.options).forEach((dropdown) => {
              Object.keys(setting.options[dropdown].options).forEach((option) => {
                document.body.classList.remove(`${settingKey}-${dropdown}-${option}`);
                if (newUserPrefs[catKey][settingKey][dropdown] === option) {
                  document.body.classList.add(`${settingKey}-${dropdown}-${option}`);
                }
              });
            });
            break;

          case 'range':
            Object.keys(setting.options).forEach((optionKey) => {
              const option = setting.options[optionKey];
              for (let i = option.min; i <= option.max; i += option.step) {
                document.body.classList.remove(`${optionKey}-${i}`);
              }
              document.body.classList.add(
                `${optionKey}-${newUserPrefs[catKey][settingKey][optionKey]}`,
              );
            });
            break;

          default:
            break;
        }
      });
    });
  },
};
