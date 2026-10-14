// Runs after `npm run build` (the package.json postbuild script): puts the Azure upload SAS
// from the VF_UPLOAD_SAS environment variable into the compiled shadow config, so the SAS is
// never in the source tree. Without the variable the build still succeeds and the app simply
// does not upload (a plain dev build); set VF_REQUIRE_UPLOAD_SAS=1 to make a missing SAS fail
// the build instead, which the tester-installer workflow does.
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'www',
  'js',
  'addons',
  'voice-follow',
  'shadow',
  'config.js',
);
const PLACEHOLDER = '__VF_UPLOAD_SAS__';
const sas = (process.env.VF_UPLOAD_SAS || '').trim();

if (!fs.existsSync(file)) {
  console.log(`inject-upload-sas: ${file} not found (no shadow build in this tree), skipping`);
  process.exit(0);
}
let src = fs.readFileSync(file, 'utf8');
// Stamp the exact build commit so every uploaded session says which release made it.
// Independent of the SAS: done even for dev builds.
if (src.includes('__VF_BUILD_COMMIT__')) {
  let commit = (process.env.GITHUB_SHA || '').trim();
  if (!commit) {
    try {
      commit = require('child_process')
        .execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch (e) {
      commit = '';
    }
  }
  if (/^[0-9a-f]{7,40}$/.test(commit)) {
    src = src.replace('__VF_BUILD_COMMIT__', commit.slice(0, 12));
    fs.writeFileSync(file, src);
    console.log(`inject-upload-sas: build commit ${commit.slice(0, 12)} stamped`);
  }
}
if (!sas) {
  if (process.env.VF_REQUIRE_UPLOAD_SAS === '1') {
    console.error('inject-upload-sas: VF_UPLOAD_SAS is not set and VF_REQUIRE_UPLOAD_SAS=1');
    process.exit(1);
  }
  console.log('inject-upload-sas: VF_UPLOAD_SAS not set; this build will not upload sessions');
  process.exit(0);
}
if (!src.includes(PLACEHOLDER)) {
  if (src.includes(sas)) {
    console.log('inject-upload-sas: already injected');
    process.exit(0);
  }
  console.error('inject-upload-sas: placeholder not found in the compiled config');
  process.exit(2);
}
if (/['\\\n\r]/.test(sas)) {
  console.error('inject-upload-sas: the SAS contains characters that cannot be injected');
  process.exit(3);
}
let out = src.replace(PLACEHOLDER, sas);
// Optional: a Hugging Face write token for the second copy (never required).
const hf = (process.env.VF_HF_TOKEN || '').trim();
if (hf && !/['\\\n\r]/.test(hf) && out.includes('__VF_HF_TOKEN__')) {
  out = out.replace('__VF_HF_TOKEN__', hf);
  console.log('inject-upload-sas: Hugging Face token injected');
}
fs.writeFileSync(file, out);
console.log('inject-upload-sas: upload SAS injected');
