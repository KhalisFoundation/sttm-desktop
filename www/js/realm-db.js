const electron = require('electron');
const path = require('path');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const realmPath = path.resolve(userDataPath, 'sttmdesktop.realm');

const RaagSchema = {
  name: 'Raag',
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

const SourceSchema = {
  name: 'Source',
  properties: {
    UniqueID: 'int',
    SourceID: 'string',
    SourceGurmukhi: 'string?',
    SourceUnicode: 'string?',
    SourceEnglish: 'string?',
  },
};

const VerseSchema = {
  name: 'Verse',
  properties: {
    ID: 'int',
    English: 'string?',
    Gurmukhi: 'string?',
    GurmukhiBisram: 'string?',
    GurmukhiUni: 'string?',
    WriterID: 'int?',
    Punjabi: 'string?',
    PunjabiUni: 'string?',
    Spanish: 'string?',
    RaagID: 'int?',
    PageNo: 'int?',
    LineNo: 'int?',
    SourceID: 'string',
    FirstLetterStr: 'string?',
    MainLetters: 'string?',
    Bisram: 'string?',
    igurbani_bisram1: 'string?',
    igurbani_bisram2: 'string?',
    FirstLetterEng: 'string?',
    Transliteration: 'string?',
    Updated: 'string',
    FirstLetterLen: 'int',
  },
};

const WriterSchema = {
  name: 'Writer',
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
    schema: [VerseSchema],
  },

  realmMetaSchema: {
    path: realmPath,
    schema: [RaagSchema, SourceSchema, WriterSchema],
  },
};
