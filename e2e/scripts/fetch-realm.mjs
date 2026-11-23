#!/usr/bin/env node
// Downloads the Realm database the app uses, for machines (CI) where the app
// has never run. The tests look at STTM_E2E_REALM_DIR, the installed app's
// data folder, then e2e/.cache, which this fills.
//
//   node e2e/scripts/fetch-realm.mjs
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Same source as the app (www/main/desktop_scripts.js).
const BASE = 'https://banidb.blob.core.windows.net/database';
const ZIP = 'sttmdesktop-evergreen-v2.zip';
const DB_FILE = 'sttmdesktop-evergreen-v2.realm';
const SCHEMA_FILE = 'realm-schema-evergreen.json';

const require = createRequire(import.meta.url);
const extract = require('extract-zip');

const cacheDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache');

async function main() {
  const target = path.join(cacheDir, DB_FILE);
  if (
    existsSync(target) &&
    statSync(target).size > 0 &&
    existsSync(path.join(cacheDir, SCHEMA_FILE))
  ) {
    process.stdout.write(`${target} already present\n`);
    return;
  }
  mkdirSync(cacheDir, { recursive: true });
  const zip = path.join(cacheDir, ZIP);
  process.stdout.write(`Downloading ${BASE}/${ZIP}\n`);
  const response = await fetch(`${BASE}/${ZIP}`);
  if (!response.ok || !response.body) throw new Error(`download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zip));
  const extractDir = path.join(cacheDir, 'unzipped');
  rmSync(extractDir, { recursive: true, force: true });
  await extract(zip, { dir: extractDir });
  for (const file of [DB_FILE, SCHEMA_FILE]) {
    const found = path.join(extractDir, file);
    if (!existsSync(found)) throw new Error(`${file} not found in ${zip}`);
    renameSync(found, path.join(cacheDir, file));
  }
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(zip, { force: true });
  process.stdout.write(`Saved ${target} (${(statSync(target).size / 1e6).toFixed(0)} MB)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
