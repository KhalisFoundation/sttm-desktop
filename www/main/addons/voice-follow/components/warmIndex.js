// One retrieval index per window, built once and kept warm across Start/Stop.
//
// Before this the trigram index over the whole Gurbani corpus was built from scratch on
// every Start and thrown away on every Stop. A Stop (or a second Start) during the ~2-3 s
// build cancelled it: the first decodes of the next run had no index, and a tester's
// errors.log filled with "Canonical retrieval is closed". Now the index is built as soon
// as the database is ready, survives every Stop, and is only rebuilt when the database
// changes, after a failure (the next Start retries), or when the window goes away.
//
// `create` returns a retrieval client ({ ready: Promise, search, dispose }); the main
// process still allows one session per window and a new client's token still supersedes
// the previous one, so the security model is unchanged: there is simply one long-lived
// client instead of one per run.
function createWarmIndex({ create, onReady = () => {}, onError = () => {}, now = Date.now }) {
  let client = null; // the ready client
  let building = null; // in-flight build: { client, promise }
  let failedAt = 0; // when the last build (or search) failed; 0 once a build succeeds
  let builds = 0;

  const drop = (c) => {
    if (!c) return;
    if (client === c) client = null;
    if (building && building.client === c) building = null;
    c.dispose().catch(() => {});
  };

  return {
    // The ready client, or null while it is still building / after a failure.
    get: () => client,
    // Resolves to the ready client (null if the build failed). Always retries after a
    // failure: callers decide how often (see ensureFlIndex in VoiceFollow.jsx).
    ensure() {
      if (client) return Promise.resolve(client);
      if (building) return building.promise;
      const t0 = now();
      const c = create();
      const build = { client: c };
      builds += 1;
      build.promise = c.ready
        .then((ready) => {
          if (building !== build) return null; // dropped or reset while building
          building = null;
          client = c;
          failedAt = 0;
          onReady({ ms: now() - t0, rows: ready && ready.rows, builds });
          return c;
        })
        .catch((error) => {
          if (building === build) {
            building = null;
            failedAt = now();
            onError(error, { ms: now() - t0 });
          }
          c.dispose().catch(() => {});
          return null;
        });
      building = build;
      return build.promise;
    },
    // A client whose search failed is unusable (the worker was released): let it go so
    // the next ensure() builds a fresh one.
    fail(c) {
      if (c && (client === c || (building && building.client === c))) failedAt = now();
      drop(c);
    },
    failedAt: () => failedAt,
    // The database changed or the window is going away: release everything.
    reset() {
      const b = building;
      building = null;
      drop(client);
      if (b) drop(b.client);
    },
    builds: () => builds,
  };
}

module.exports = { createWarmIndex };
