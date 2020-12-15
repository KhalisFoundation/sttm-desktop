const convertToLegacySettingsObj = newObject => {
  const legacyObj = {
    toolbar: {
      'gurbani-options': {
        'display-visraams': newObject['display-vishraams'],
      },
      vishraam: {
        'vishraam-options': newObject['vishraam-type'],
        'vishraam-source': newObject['vishraam-source'],
      },
    },
    'slide-layout': {
      fields: {
        'display-translation': newObject['translation-visibility'],
        'display-transliteration': newObject['transliteration-visibility'],
        'display-teeka': newObject['teeka-visibility'],
        'display-next-line': newObject['display-next-line'],
      },
      'font-sizes': {
        announcements: newObject['announcements-font-size'],
        gurbani: newObject['gurbani-font-size'],
        translation: newObject['translation-font-size'],
        transliteration: newObject['transliteration-font-size'],
        teeka: newObject['teeka-font-size'],
      },
      'language-settings': {
        'translation-language': newObject['translation-language'],
        'transliteration-language': newObject['transliteration-language'],
      },
      'larivaar-settings': {
        'assist-type': newObject['larivaar-assist-type'],
      },
      'display-options': {
        larivaar: newObject['larivaar'],
        'larivaar-assist': newObject['larivaar-assist'],
        'left-align': newObject['left-align'],
      },
    },
  };

  return legacyObj;
};

export default convertToLegacySettingsObj;
