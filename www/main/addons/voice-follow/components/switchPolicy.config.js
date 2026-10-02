// Single source of shipped Voice-Follow tuning for tests + harness.
// Reads the constants out of VoiceFollow.jsx so checks always evaluate the
// config the app actually runs. Exits non-zero if a constant goes missing
// (rename/expression change), so drift fails loudly instead of silently.
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'VoiceFollow.jsx'), 'utf8');

function shipped(name) {
  const m = SRC.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
  if (!m) {
    console.error(`DRIFT: const ${name} not found in VoiceFollow.jsx`);
    process.exit(2);
  }
  return parseFloat(m[1]);
}

module.exports = {
  shipped,
  CFG: {
    min: shipped('SWITCH_ACOUSTIC_MIN'),
    margin: shipped('SWITCH_ACOUSTIC_MARGIN'),
    strongMin: shipped('SWITCH_STRONG_MIN'),
    strongMargin: shipped('SWITCH_STRONG_MARGIN'),
  },
  CONFIRM: shipped('SWITCH_CONFIRM'),
  HYP_MIN: shipped('SWITCH_HYP_MIN'),
  HOLD: shipped('EMPTY_HOLD_DECODES'),
  HOP_S: shipped('AP_REC_HOP_S'),
};
