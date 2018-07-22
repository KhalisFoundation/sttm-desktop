const SEARCH_TYPES = {
  FIRST_LETTERS: 0,
  FIRST_LETTERS_ANYWHERE: 1,
  GURMUKHI_WORD: 2,
  ENGLISH_WORD: 3,
  ANG: 4,
};

const GURMUKHI_SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'First Letter (Start)',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'First Anywhere (Start)',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'Full Word(s)',
};

const ENGLISH_SEARCH_TEXTS = {
  [SEARCH_TYPES.ENGLISH_WORD]: 'Full Word(s)',
};

const SOURCE_TEXTS = {
  all: 'All sources',
  G: 'Guru Granth Sahib Ji',
  D: 'Dasam Granth Sahib',
  B: 'Bhai Gurdas Ji Vaaran',
  N: 'Bhai Nand Lal Ji Vaaran',
  A: 'Amrit Keertan',
  S: 'Bhai Gurdas Singh Ji Vaaran',
  R: 'Rehatnamas & Panthic sources',
};

module.exports = {
  SEARCH_TYPES,
  GURMUKHI_SEARCH_TEXTS,
  ENGLISH_SEARCH_TEXTS,
  SOURCE_TEXTS,
};
