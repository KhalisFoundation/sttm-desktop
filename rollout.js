/**
 * Staged rollout by US state / region.
 *
 * Before the automatic update check, the app reads rollout.json from the release bucket:
 *   { "version": "9.1.0", "regions": ["US-CA", "US-WA"], "geoUrl": "https://..." }
 * While the app is older than `version` and its region is not listed, the automatic
 * check is skipped. Regions are ISO 3166-2 codes; a bare country code ("CA") allows
 * the whole country. The region comes from `geoUrl`, a small lookup service that
 * answers { "country": "US", "region": "US-CA" }.
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

const fetchJson = async (url) => {
  const res = await fetch(url, { timeout: TIMEOUT_MS, headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
};

/** Returns a final answer when location doesn't matter, otherwise null. */
const decideWithoutLocation = (rules, appVersion) => {
  if (!rules || typeof rules !== 'object' || !rules.version || !Array.isArray(rules.regions)) {
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
  if (!region && !country) return { update: false, reason: 'location unknown, waiting' };

  const allowed = rules.regions.map((r) => String(r).toUpperCase());
  if ((region && allowed.includes(region)) || (country && allowed.includes(country))) {
    return { update: true, reason: `${region || country} is in the rollout` };
  }
  return {
    update: false,
    reason: `${region || country} is not in the ${rules.version} rollout yet`,
  };
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

module.exports = { decide, shouldAutoUpdate, ROLLOUT_URL };
