// Benchmark only: load the shadow config with SHADOW_BUILD off so the headless harness sees
// the real screen actions (in a shadow build they go to the shadow bus instead).
// Patches the app under test: VF_DRIVER_ROOT (see bench-driver.js), else this worktree.
const path = require('path');
const root = process.env.VF_DRIVER_ROOT ? path.resolve(process.env.VF_DRIVER_ROOT) : path.resolve(__dirname, '../../..');
const p = require.resolve(path.join(root, 'www/main/addons/voice-follow/shadow/config.js'));
const real = require(p);
require.cache[p].exports = { ...real, SHADOW_BUILD: false };
