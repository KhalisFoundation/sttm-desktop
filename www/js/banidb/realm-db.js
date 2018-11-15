const electron = require('electron');
const path = require('path');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const realmPath = path.resolve(userDataPath, 'sttmdesktop.realm');

const RaagSchema = {
  name: 'Raag',
  primaryKey: 'RaagID',
  properties: {
    RaagID: 'int',
    RaagGurmukhi: 'string?',
    RaagUnicode: 'string?',
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
    SourceUnicode: 'string?',
    SourceEnglish: 'string?',
  },
};

const VerseSchema = {
  name: 'Verse',
  primaryKey: 'ID',
  properties: {
    ID: 'int',
    English: 'string?',
    Gurmukhi: 'string?',
    GurmukhiBisram: 'string?',
    GurmukhiUni: 'string?',
    Writer: 'Writer?',
    Punjabi: 'string?',
    PunjabiUni: 'string?',
    Spanish: 'string?',
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
    Bisram: 'string?',
    igurbani_bisram1: 'string?',
    igurbani_bisram2: 'string?',
    FirstLetterEng: {
      type: 'string?',
      indexed: true,
    },
    Transliteration: 'string?',
    Updated: 'date',
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
    WriterUnicode: 'string?',
  },
};

module.exports = {
  realmVerseSchema: {
    path: realmPath,
    schema: [RaagSchema, ShabadSchema, SourceSchema, VerseSchema, WriterSchema],
  },
};
