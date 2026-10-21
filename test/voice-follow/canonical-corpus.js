// Read-only canonical corpus fixture for component regression tests.
const fs = require('fs');
const path = require('path');
const Realm = require('realm');
const anvaad = require('anvaad-js');

async function readCorpus(userData, { retainRealm } = {}) {
  const schema = JSON.parse(fs.readFileSync(path.join(userData, 'realm-schema-evergreen.json')));
  const realm = await Realm.open({
    path: path.join(userData, 'sttmdesktop-evergreen-v2.realm'),
    schema: schema.schemas,
    schemaVersion: schema.schemaVersion,
    readOnly: true,
  });
  // Realm may return an existing instance for the same configuration. An app
  // replay owns that shared handle until all live query objects are finished.
  if (retainRealm) retainRealm(realm);
  try {
    return Array.from(realm.objects('Verse').sorted('ID'), (r) => ({
      verseId: r.ID,
      shabadId: r.Shabads[0]?.ShabadID,
      shabadIds: Array.from(r.Shabads, (s) => s.ShabadID),
      text: anvaad.unicode(r.Gurmukhi || ''),
      ascii: r.Gurmukhi,
      fl: (r.FirstLetterStr || '')
        .split(',')
        .filter(Boolean)
        .map((x) => String.fromCharCode(Number(x)))
        .join(''),
    })).filter((r) => r.shabadId != null && r.text);
  } finally {
    if (!retainRealm) realm.close();
  }
}
module.exports = { readCorpus };
