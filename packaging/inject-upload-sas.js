// Runs after `npm run build` (the package.json postbuild script): injects upload credentials
// from environment variables into the compiled shadow config, so secrets are never in source.
// Azure uploads remain optional unless VF_REQUIRE_UPLOAD_SAS=1; Hugging Face uploads work
// independently when VF_HF_TOKEN is provided.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
      commit = execSync('git rev-parse HEAD', {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'ignore'],
      })
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
let out = src;
if (!sas) {
  if (process.env.VF_REQUIRE_UPLOAD_SAS === '1') {
    console.error('inject-upload-sas: VF_UPLOAD_SAS is not set and VF_REQUIRE_UPLOAD_SAS=1');
    process.exit(1);
  }
  console.log('inject-upload-sas: VF_UPLOAD_SAS not set; Azure uploads are disabled');
} else if (!src.includes(PLACEHOLDER)) {
  if (!src.includes(sas)) {
    console.error('inject-upload-sas: placeholder not found in the compiled config');
    process.exit(2);
  }
  console.log('inject-upload-sas: already injected');
} else if (/['\\\n\r]/.test(sas)) {
  console.error('inject-upload-sas: the SAS contains characters that cannot be injected');
  process.exit(3);
} else {
  out = out.replace(PLACEHOLDER, sas);
}
// Optional: a Hugging Face write token for the second copy (never required).
const hf = (process.env.VF_HF_TOKEN || '').trim();
if (hf) {
  if (/['\\\n\r]/.test(hf)) {
    console.error(
      'inject-upload-sas: the Hugging Face token contains characters that cannot be injected',
    );
    process.exit(4);
  }
  if (out.includes('__VF_HF_TOKEN__')) {
    out = out.replace('__VF_HF_TOKEN__', hf);
    console.log('inject-upload-sas: Hugging Face token injected');
  } else if (out.includes(hf)) {
    console.log('inject-upload-sas: Hugging Face token already injected');
  } else {
    console.error(
      'inject-upload-sas: Hugging Face token placeholder not found in the compiled config',
    );
    process.exit(5);
  }
}
fs.writeFileSync(file, out);
if (sas) console.log('inject-upload-sas: upload SAS injected');
