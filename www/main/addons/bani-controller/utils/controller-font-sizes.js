// The web controller sizes Gurbani and each content type (translation, teeka,
// transliteration), but the desktop sizes Gurbani and three content slots
// (content1-3), each showing whichever type the user picked (e.g.
// 'teeka-punjabi'). These map between the two.

const CONTENT_SLOTS = ['content1', 'content2', 'content3'];
const CONTENT_TYPES = ['translation', 'teeka', 'transliteration'];

// The slot showing a content type ('translation' → 'content1'), 'gurbani' as
// is, or undefined when no slot shows it.
export const getFontSizeSlot = (target, userSettings) => {
  if (target === 'gurbani') return target;
  return CONTENT_SLOTS.find((slot) => String(userSettings[slot]).startsWith(`${target}-`));
};

// { gurbani, translation, teeka, transliteration } for the web controller; a
// type no slot shows is null.
export const getControllerFontSizes = (userSettings) => {
  const fontSizes = { gurbani: parseInt(userSettings.gurbaniFontSize, 10) };
  CONTENT_TYPES.forEach((type) => {
    const slot = getFontSizeSlot(type, userSettings);
    fontSizes[type] = slot ? parseInt(userSettings[`${slot}FontSize`], 10) : null;
  });
  return fontSizes;
};
