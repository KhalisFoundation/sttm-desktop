export const SEARCH_TYPES = {
  FIRST_LETTERS: 0,
  FIRST_LETTERS_ANYWHERE: 1,
  GURMUKHI_WORD: 2,
  ENGLISH_WORD: 3,
  ANG: 4,
};

export const GURMUKHI_SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'First Letter (Start)',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'First Letter (Anywhere)',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'Full Word(s)',
};

export const ENGLISH_SEARCH_TEXTS = {
  [SEARCH_TYPES.ENGLISH_WORD]: 'Full Word(s)',
};

export const SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'First Letter (Start)',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'First Letter (Anywhere)',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'Full Word(s) - Gurmukhi',
  [SEARCH_TYPES.ENGLISH_WORD]: 'Full Word(s) - English',
  [SEARCH_TYPES.ANG]: 'ANG',
};

export const SOURCE_TYPES = {
  ALL_SOURCES: 'all',
  GURU_GRANTH_SAHIB: 'G',
  DASAM_GRANTH: 'D',
  GURDAS_VAARAN: 'B',
  NAND_LAL_VAARAN: 'N',
  AMRIT_KEERTAN: 'A',
  GURDAS_JI_VAARAN: 'S',
  REHATNAMAS: 'R',
};

export const SOURCE_TEXTS = {
  [SOURCE_TYPES.ALL_SOURCES]: 'All sources',
  [SOURCE_TYPES.GURU_GRANTH_SAHIB]: 'Guru Granth Sahib Ji',
  [SOURCE_TYPES.DASAM_GRANTH]: 'Dasam Granth Sahib',
  [SOURCE_TYPES.GURDAS_VAARAN]: 'Bhai Gurdas Ji Vaaran',
  [SOURCE_TYPES.NAND_LAL_VAARAN]: 'Bhai Nand Lal Ji Vaaran',
  [SOURCE_TYPES.AMRIT_KEERTAN]: 'Amrit Keertan',
  [SOURCE_TYPES.GURDAS_JI_VAARAN]: 'Bhai Gurdas Singh Ji Vaaran',
  [SOURCE_TYPES.REHATNAMAS]: 'Rehatnamas & Panthic sources',
};
