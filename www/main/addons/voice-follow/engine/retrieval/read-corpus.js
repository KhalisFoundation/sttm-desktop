// Worker-owned, read-only canonical database snapshot. Never pass Realm objects
// across threads or retain the handle after copying the searchable source text.
const fs = require('fs');
const path = require('path');
const Realm = require('realm');
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
const anvaad = require('anvaad-js');

async function readCorpus(userData) {
  const schema = JSON.parse(fs.readFileSync(path.join(userData, 'realm-schema-evergreen.json')));
  const realm = await Realm.open({
    path: path.join(userData, 'sttmdesktop-evergreen-v2.realm'),
    schema: schema.schemas,
    schemaVersion: schema.schemaVersion,
    readOnly: true,
  });
  try {
    return Array.from(realm.objects('Verse').sorted('ID'), (row) => ({
      verseId: row.ID,
      shabadId: row.Shabads[0]?.ShabadID,
      text: anvaad.unicode(row.Gurmukhi || ''),
    })).filter((row) => row.shabadId != null && row.text);
  } finally {
    realm.close();
  }
}
module.exports = { readCorpus };
