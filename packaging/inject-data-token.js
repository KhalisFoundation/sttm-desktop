// Runs after `npm run build` (package.json postbuild): puts the Hugging Face write token for STTM
// Data recordings from the VF_HF_TOKEN environment variable into the compiled config, so the
// token is never in the source tree. Without the variable the build still succeeds and the
// recording bar simply stays hidden.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'www', 'js', 'data-recording', 'config.js');
const PLACEHOLDER = '__VF_HF_TOKEN__';

if (!fs.existsSync(file)) {
  console.log('inject-data-token: compiled config not found; nothing to do');
  process.exit(0);
}
const token = (process.env.VF_HF_TOKEN || '').trim();
if (!token) {
  console.log('inject-data-token: VF_HF_TOKEN not set; recording uploads are off in this build');
  process.exit(0);
}
if (/['\\\n\r]/.test(token)) {
  console.error('inject-data-token: the token contains characters that cannot be injected');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
if (!src.includes(PLACEHOLDER)) {
  if (src.includes(token)) {
    console.log('inject-data-token: already injected');
    process.exit(0);
  }
  console.error('inject-data-token: placeholder not found in the compiled config');
  process.exit(2);
}
fs.writeFileSync(file, src.replace(PLACEHOLDER, token));
console.log('inject-data-token: Hugging Face token injected');
