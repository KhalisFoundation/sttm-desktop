const electron = require('electron');
const path = require('path');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const realmPath = path.resolve(userDataPath, 'sttmdesktop.realm');

const BaniSchema = {
  name: 'Banis',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Token: {
      type: 'string',
      indexed: true,
    },
    Gurmukhi: 'string',
    Updated: 'date?',
  },
};

const BanisBookmarksSchema = {
  name: 'Banis_Bookmarks',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Bani: {
      type: 'int',
      indexed: true,
    },
    BaniShabadID: 'int',
    Gurmukhi: 'string',
    Seq: 'int',
    Updated: 'date?',
  },
};

const BanisCustomSchema = {
  name: 'Banis_Custom',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    English: 'string?',
    Gurmukhi: 'string?',
    Updated: 'date?',
  },
};

const BanisShabadSchema = {
  name: 'Banis_Shabad',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Bani: 'Banis',
    Shabad: 'Shabad?',
    Verse: 'Verse?',
    Custom: 'Banis_Custom?',
    Seq: 'int',
    header: 'int',
    MangalPosition: 'string?',
    existsSGPC: 'bool',
    existsMedium: 'bool',
    existsTaksal: 'bool',
    existsBuddhaDal: 'bool',
    Updated: 'date?',
    Paragraph: 'int',
  },
};

const CeremoniesSchema = {
  name: 'Ceremonies',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Seq: 'int',
    Token: {
      type: 'string',
      indexed: true,
    },
    Gurmukhi: 'string',
    Updated: 'date?',
  },
};

const CeremoniesCustomSchema = {
  name: 'Ceremonies_Custom',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    English: 'string?',
    Gurmukhi: 'string?',
    Updated: 'date?',
  },
};

const CeremoniesShabadSchema = {
  name: 'Ceremonies_Shabad',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Seq: 'int',
    Ceremony: 'Ceremonies',
    Shabad: 'Shabad?',
    Verse: 'Verse?',
    Custom: 'Ceremonies_Custom?',
    VerseIDRangeStart: 'int?',
    VerseIDRangeEnd: 'int?',
    Updated: 'date?',
  },
};

const RaagSchema = {
  name: 'Raag',
  primaryKey: 'RaagID',
  properties: {
    RaagID: 'int',
    RaagGurmukhi: 'string?',
    RaagEnglish: 'string?',
    StartID: 'int?',
    EndID: 'int?',
    RaagWithPage: 'string?',
  },
};

const ShabadSchema = {
  name: 'Shabad',
  primaryKey: 'ShabadID',
  properties: {
    ShabadID: 'int',
  },
};

const SourceSchema = {
  name: 'Source',
  primaryKey: 'SourceID',
  properties: {
    SourceID: 'string',
    SourceGurmukhi: 'string?',
    SourceEnglish: 'string?',
  },
};

const VerseSchema = {
  name: 'Verse',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    Gurmukhi: 'string?',
    Translations: 'string?',
    Writer: 'Writer?',
    Raag: 'Raag?',
    PageNo: {
      type: 'int?',
      indexed: true,
    },
    LineNo: 'int?',
    Source: 'Source',
    FirstLetterStr: {
      type: 'string?',
      indexed: true,
    },
    MainLetters: 'string?',
    Visraam: 'string?',
    FirstLetterEng: {
      type: 'string?',
      indexed: true,
    },
    Updated: 'date?',
    FirstLetterLen: {
      type: 'int?',
      indexed: true,
    },
    Shabads: 'Shabad[]',
  },
};

const WriterSchema = {
  name: 'Writer',
  primaryKey: 'WriterID',
  properties: {
    WriterID: 'int',
    WriterEnglish: 'string?',
    WriterGurmukhi: 'string?',
  },
};

module.exports = {
  realmVerseSchema: {
    path: realmPath,
    schema: [BaniSchema,
      BanisBookmarksSchema,
      BanisCustomSchema,
      BanisShabadSchema,
      CeremoniesCustomSchema,
      CeremoniesSchema,
      CeremoniesShabadSchema,
      RaagSchema,
      ShabadSchema,
      SourceSchema,
      VerseSchema,
      WriterSchema],
  },
};
