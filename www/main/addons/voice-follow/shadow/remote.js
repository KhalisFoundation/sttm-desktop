// Remote switch for the collector. A small JSON (COLLECTOR_CONFIG_URL) is fetched at launch and
// hourly. Shape (every field optional):
//   { "enabled": true, "percent": 10, "allow": ["<installId>", ...], "block": ["<installId>", ...] }
// Prod build (PROD_COLLECTOR): OFF unless the server says on for this install —
//   block wins; then enabled must be true; then allow-listed installs are on; then a stable
//   0-99 bucket of the install id must be below `percent` (default 0).
//   Unreachable / 404 / malformed = keep the last good answer; with none (or older than
//   COLLECTOR_CONFIG_MAX_AGE_MS) = off. So a fresh install never collects until the server agrees.
// Tester build: unchanged — only an explicit {"enabled": false} turns it off.
const {
  COLLECTOR_CONFIG_URL,
  COLLECTOR_CONFIG_EVERY_MS,
  COLLECTOR_CONFIG_MAX_AGE_MS,
  PROD_COLLECTOR,
} = require('./config');
const { guard } = require('./diag');

const CACHE_KEY = 'vfCollectorConfig';

// Stable 0-99 bucket for an install id (FNV-1a), so a percent rollout keeps the same installs.
/* eslint-disable no-bitwise */
const bucketOf = (id) => {
  let h = 0x811c9dc5;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
};
/* eslint-enable no-bitwise */

// The rule, kept pure for the tests.
const enabledFrom = (cfg, installId, prod = PROD_COLLECTOR) => {
  const ok = cfg && typeof cfg === 'object';
  if (!prod) return !(ok && cfg.enabled === false);
  if (!ok || cfg.enabled !== true || !installId) return false;
  if (Array.isArray(cfg.block) && cfg.block.includes(installId)) return false;
  if (Array.isArray(cfg.allow) && cfg.allow.includes(installId)) return true;
  const pct = Number(cfg.percent);
  return Number.isFinite(pct) && bucketOf(installId) < Math.max(0, Math.min(100, pct));
};

const readCache = (now = Date.now()) => {
  try {
    const c = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.cfg && now - c.at <= COLLECTOR_CONFIG_MAX_AGE_MS) return c.cfg;
  } catch (_) {
    /* no cache */
  }
  return null;
};
const writeCache = (cfg) => {
  try {
    global.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), cfg }));
  } catch (_) {
    /* best effort */
  }
};

let installIdNow = '';
let cfgNow = null;
let enabledNow = !PROD_COLLECTOR;
let timer = null;
let onChange = () => {};
let log = () => {};

function apply(cfg, why) {
  cfgNow = cfg;
  const next = enabledFrom(cfgNow, installIdNow);
  if (next !== enabledNow) {
    enabledNow = next;
    log(`collector: remote config (${why}) says ${next ? 'enabled' : 'disabled'} for this install`);
    onChange(next);
  }
}

async function fetchOnce() {
  const fetchFn = global.fetch;
  if (!fetchFn || !COLLECTOR_CONFIG_URL) return;
  let cfg;
  try {
    const res = await fetchFn(`${COLLECTOR_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return; // keep the last answer
    cfg = await res.json();
  } catch (_) {
    return; // offline: keep the last answer
  }
  if (!cfg || typeof cfg !== 'object') return;
  writeCache(cfg);
  apply(cfg, 'server');
}

function start(opts = {}) {
  if (opts.onChange) onChange = opts.onChange;
  if (opts.log) log = opts.log;
  if (opts.installId !== undefined && opts.installId !== installIdNow) {
    installIdNow = opts.installId || '';
    if (cfgNow) apply(cfgNow, 'install id');
  }
  if (timer) return;
  if (PROD_COLLECTOR && !cfgNow) {
    const cached = readCache();
    if (cached) apply(cached, 'cached');
  }
  fetchOnce();
  timer = setInterval(guard('remote.tick', fetchOnce), COLLECTOR_CONFIG_EVERY_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

const enabled = () => enabledNow;

module.exports = {
  start: guard('remote.start', start),
  stop: guard('remote.stop', stop),
  enabled,
  enabledFrom,
  bucketOf,
};
