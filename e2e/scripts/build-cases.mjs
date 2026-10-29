#!/usr/bin/env node
// Turns the QA sheet (exported as CSV) into e2e/cases.json: one entry per test
// row with a stable ID, so tests can carry the sheet's row in their title and
// the report can be read back against the sheet.
//
//   node e2e/scripts/build-cases.mjs e2e/cases/sttm-desktop-9.3.2.csv > e2e/cases.json
//
// IDs are <GROUP>-<nn>, numbered by row order within each group. Rows keep
// their IDs when text changes; a new row at the end of a group gets the next
// number. Inserting a row mid-group shifts later IDs, so add new rows at the end.
import { readFileSync } from 'node:fs';

// Sheet group heading → ID prefix.
const GROUPS = {
  'Core Functionality': 'CORE',
  Search: 'SRCH',
  'Additional options': 'MISC',
  History: 'HIST',
  Themes: 'THEME',
  'Display Options': 'DISP',
  'Shortcut Tray': 'TRAY',
  'Bani Overlay': 'OVERLAY',
  Chromecast: 'CAST',
  'Sunder Gutka/Ceremonies': 'SG',
  'KeyBoard shortcuts': 'KEYS',
  Sync: 'SYNC',
  'Single Display Mode': 'SINGLE',
  'Login and Favourites': 'FAV',
  'Multi-pane feature': 'MULTI',
  'Voice Search': 'VOICE',
};

// What a machine can do with each row. Everything not listed is "auto".
// manual: needs hardware or a human (second display, Chromecast, SSO login,
//   pasting into OBS, speech recognition).
// partial: the mechanical part is automated, the judgement call is not.
const AUTOMATION = {
  'CORE-01': 'manual',
  'CORE-02': 'partial',
  'THEME-02': 'partial',
  'DISP-09': 'partial',
  'OVERLAY-04': 'manual',
  'CAST-01': 'manual',
  'CAST-02': 'manual',
  'CAST-03': 'manual',
  'SYNC-04': 'partial',
  'SYNC-05': 'partial',
  'SYNC-06': 'partial',
  'SYNC-07': 'partial',
  'SYNC-08': 'partial',
  'FAV-01': 'manual',
  'FAV-02': 'partial',
  'FAV-03': 'partial',
  'FAV-04': 'partial',
  'FAV-05': 'manual',
  'VOICE-01': 'partial',
  'VOICE-02': 'manual',
  'VOICE-03': 'manual',
  'VOICE-04': 'partial',
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: build-cases.mjs <sheet.csv>\n');
  process.exit(2);
}

const rows = parseCsv(readFileSync(file, 'utf8'));
const version = (rows[0]?.[0] ?? '').replace(/^Version Number:\s*/u, '').trim();
const cases = [];
let group = null;
let index = 0;
rows.forEach((cells, rowIndex) => {
  const text = (cells[0] ?? '').trim();
  if (!text) return;
  if (GROUPS[text]) {
    group = GROUPS[text];
    index = 0;
    return;
  }
  if (!group) return; // the version/header lines above the first group
  index++;
  const id = `${group}-${String(index).padStart(2, '0')}`;
  cases.push({
    id,
    group,
    row: rowIndex + 1,
    text,
    automation: AUTOMATION[id] ?? 'auto',
  });
});

process.stdout.write(
  `${JSON.stringify({ sheetVersion: version, generatedFrom: file, cases }, null, 2)}\n`,
);
