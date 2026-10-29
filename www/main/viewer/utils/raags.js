import { BANIDB_API } from '../../common/constants/api-urls';

// The Realm database only has raag names. Their descriptions (overview, feeling,
// time of day) come from BaniDB, fetched once and kept for the session. A failed
// fetch (e.g. offline) is forgotten, so the next shabad overview tries again.
let raags = null;

export const fetchRaag = (raagId) => {
  if (!raags) {
    raags = fetch(`${BANIDB_API}/raags`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => data.rows)
      .catch((err) => {
        raags = null;
        throw err;
      });
  }
  return raags.then((rows) => rows.find((raag) => raag.RaagID === raagId));
};
