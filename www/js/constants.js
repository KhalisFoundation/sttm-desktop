const SEARCH_TYPES = {
  FIRST_LETTERS: 0,
  FIRST_LETTERS_ANYWHERE: 1,
  GURMUKHI_WORD: 2,
  ENGLISH_WORD: 3,
  ANG: 4,
};

const SEARCH_TYPE_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'First Letter Start (Gurmukhi)',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'First Letter Anywhere (Gurmukhi)',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'Full Word (Gurmukhi)',
  [SEARCH_TYPES.ENGLISH_WORD]: 'English Translations (Full Word)',
  [SEARCH_TYPES.ANG]: 'Ang Search',
};

module.exports = {
  SEARCH_TYPES,
  SEARCH_TYPE_TEXTS,
};
