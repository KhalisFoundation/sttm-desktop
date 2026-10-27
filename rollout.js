/**
 * Staged rollout by US state / region, or by area (within some km of a point).
 *
 * Before the automatic update check, the app reads rollout.json from the release bucket:
 *   { "version": "9.1.0", "regions": ["US-CA", "US-WA"], "geoUrl": "https://..." }
 * While the app is older than `version` and its region is not listed, the automatic
 * check is skipped. Regions are ISO 3166-2 codes; a bare country code ("CA") allows
 * the whole country. The region comes from `geoUrl`, a small lookup service that
 * answers { "country": "US", "region": "US-CA", "city": "...", "lat": 47.6, "lon": -122.3 }.
 *
 * Areas: "areas": [{ "name": "Fresno", "lat": 36.74, "lon": -119.78, "km": 60 }]
 * allow any PC within `km` of the point. Internet-address locations are often
 * 20-50 km off (they point at the provider's hub), so use a generous radius.
 *
 * Failure rules:
 *  - rollout.json missing, unreadable, or no rule  -> update normally
 *  - rule present but location unknown             -> wait (retry on next launch)
 *  - manual "Check for updates"                    -> always allowed (handled in app.js)
 */
const fetch = require('node-fetch');
const semver = require('semver');

const ROLLOUT_URL = 'https://sttm-releases.s3.us-west-2.amazonaws.com/rollout.json';
const TIMEOUT_MS = 5000;

const EARTH_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Great-circle distance in km. */
const distanceKm = (lat1, lon1, lat2, lon2) => {
  const h =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
};

const fetchJson = async (url) => {
  const res = await fetch(url, { timeout: TIMEOUT_MS, headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
};

/** Returns a final answer when location doesn't matter, otherwise null. */
const decideWithoutLocation = (rules, appVersion) => {
  const hasRule = rules && (Array.isArray(rules.regions) || Array.isArray(rules.areas));
  if (!rules || typeof rules !== 'object' || !rules.version || !hasRule) {
    return { update: true, reason: 'no rollout rule' };
  }
  const target = semver.valid(semver.coerce(rules.version));
  const current = semver.valid(semver.coerce(appVersion));
  if (!target || !current) return { update: true, reason: 'unreadable version in rule' };
  if (semver.gte(current, target)) return { update: true, reason: `already on ${rules.version}` };
  return null;
};

/** Pure decision: returns { update: boolean, reason: string }. */
const decide = ({ rules, appVersion, location }) => {
  const early = decideWithoutLocation(rules, appVersion);
  if (early) return early;

  const region =
    location && typeof location.region === 'string' ? location.region.toUpperCase() : null;
  const country =
    location && typeof location.country === 'string' ? location.country.toUpperCase() : null;
  const lat = location && isNum(location.lat) ? location.lat : null;
  const lon = location && isNum(location.lon) ? location.lon : null;
  const where = (location && location.city) || region || country;
  if (!region && !country && lat === null) {
    return { update: false, reason: 'location unknown, waiting' };
  }

  const allowed = (rules.regions || []).map((r) => String(r).toUpperCase());
  if ((region && allowed.includes(region)) || (country && allowed.includes(country))) {
    return { update: true, reason: `${region || country} is in the rollout` };
  }
  if (lat !== null && lon !== null) {
    const area = (rules.areas || []).find(
      (r) =>
        r &&
        isNum(r.lat) &&
        isNum(r.lon) &&
        isNum(r.km) &&
        distanceKm(lat, lon, r.lat, r.lon) <= r.km,
    );
    if (area) {
      return {
        update: true,
        reason: `${where} is within ${area.km} km of ${area.name || 'an area'}`,
      };
    }
  }
  return { update: false, reason: `${where} is not in the ${rules.version} rollout yet` };
};

/** Fetches the rule (and the location only when needed) and decides. Never throws. */
const shouldAutoUpdate = async (
  appVersion,
  { rolloutUrl = ROLLOUT_URL, getJson = fetchJson } = {},
) => {
  let rules;
  try {
    rules = await getJson(rolloutUrl);
  } catch (e) {
    return { update: true, reason: `no rollout file (${e.message})` };
  }
  const early = decideWithoutLocation(rules, appVersion);
  if (early) return early;

  let location = null;
  if (rules.geoUrl) {
    try {
      location = await getJson(rules.geoUrl);
    } catch (e) {
      location = null;
    }
  }
  return decide({ rules, appVersion, location });
};

module.exports = { decide, shouldAutoUpdate, distanceKm, ROLLOUT_URL };
