import { DESKTOP_CONFIG_API } from '../common/constants/api-urls';
import { releases } from './releases';

const remote = require('@electron/remote');

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

// Kept in the app's own store, apart from the user settings
const STORE_KEY = 'gradualReleases';
const REQUEST_TIMEOUT = 10000;

const hasRun = (id) => !!store.get(`${STORE_KEY}.${id}.hasRun`);

// In development, STTM_TEST_COUNTRY=IN npm start makes the API answer as if the
// request came from that country (a local API can't locate localhost).
const testCountryHeaders = () =>
  process.env.NODE_ENV === 'development' && process.env.STTM_TEST_COUNTRY
    ? { 'x-country-code': process.env.STTM_TEST_COUNTRY }
    : {};

const fetchConfig = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(DESKTOP_CONFIG_API, {
      signal: controller.signal,
      cache: 'no-store',
      headers: testCountryHeaders(),
    });
    return response.ok ? await response.json() : null;
  } finally {
    clearTimeout(timer);
  }
};

const isReleasedIn = (releaseConfig, country) => {
  if (!releaseConfig || releaseConfig.disabled || !Array.isArray(releaseConfig.countries)) {
    return false;
  }
  const countries = releaseConfig.countries.map((code) => String(code).toUpperCase());
  return countries.includes('*') || countries.includes(country);
};

/**
 * Run the releases that haven't run on this install yet, for the countries the
 * API lists them for. Does nothing once they all have, and leaves them for the
 * next launch when offline or when the request fails.
 *
 * @param {object} globalState The easy-peasy store of the main window
 */
export const runGradualReleases = async (globalState) => {
  const pending = releases.filter(({ id }) => !hasRun(id));
  if (!pending.length) return;

  let config;
  try {
    config = await fetchConfig();
  } catch (error) {
    return;
  }

  const country =
    config && typeof config.country === 'string' ? config.country.toUpperCase() : null;
  if (!country || !config.releases) return;

  pending.forEach((release) => {
    if (!isReleasedIn(config.releases[release.id], country)) return;

    try {
      const changed = release.run(globalState);
      store.set(`${STORE_KEY}.${release.id}`, { hasRun: true, ranAt: new Date().toISOString() });
      if (analytics) {
        analytics.trackEvent({
          category: 'gradual-release',
          action: 'applied',
          label: release.id,
          value: changed ? 'changed' : 'unchanged',
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Gradual release ${release.id} failed:`, error);
    }
  });
};
