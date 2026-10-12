const remote = require('@electron/remote');

const { i18n: mainI18n } = remote.require('./app');

// i18n lives in the main process, so each i18n.t through remote is a blocking
// call to it, and components make them on every render: typing one letter in
// the search made over 400. The language doesn't change while the app runs, so
// ask once per text and remember it.
const texts = new Map();

export const i18n = {
  t: (key, options) => {
    const id = options ? `${key} ${JSON.stringify(options)}` : key;
    if (!texts.has(id)) {
      const text = mainI18n.t(key, options);
      // A key that isn't found (or not loaded yet) comes back as itself; don't
      // remember that.
      if (text === key) {
        return text;
      }
      texts.set(id, text);
    }
    return texts.get(id);
  },
};
