#!/usr/bin/env node
// Reads the QA sheet's cases (e2e/cases.json) and the last Playwright run
// (e2e/results/results.json, the json reporter) and writes e2e/report.md: one
// row per sheet case with whether it is automated and what the run said.
//
//   npm run e2e           # produces e2e/results/results.json
//   npm run e2e:report    # then this
//
// Writing results back into the Google Sheet needs a service account with
// access to the sheet; set GOOGLE_SHEETS_CREDENTIALS (path to its JSON key)
// and GOOGLE_SHEET_ID to enable that step. Without them the report is the
// Markdown file only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const casesPath = path.join(root, 'cases.json');
const resultsPath = path.join(root, 'results', 'results.json');
const reportPath = path.join(root, 'report.md');

const { sheetVersion, cases } = JSON.parse(readFileSync(casesPath, 'utf8'));
const run = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : null;

// Every test result, keyed by the sheet ID its title starts with.
const outcomes = new Map();
function collect(suite) {
  (suite.specs ?? []).forEach((spec) => {
    const id = spec.title.match(/^([A-Z]+-\d{2})\b/u)?.[1];
    if (!id) return;
    spec.tests.forEach((test) => {
      const last = test.results[test.results.length - 1];
      const status = last?.status ?? 'skipped';
      const list = outcomes.get(id) ?? [];
      list.push({ project: test.projectName, status, title: spec.title });
      outcomes.set(id, list);
    });
  });
  (suite.suites ?? []).forEach(collect);
}
if (run) run.suites.forEach(collect);

const mark = {
  passed: '✅ pass',
  failed: '❌ fail',
  timedOut: '❌ timeout',
  skipped: '⏭ skipped',
  interrupted: '⚠ interrupted',
};

function resultCell(entry) {
  const results = outcomes.get(entry.id) ?? [];
  if (results.length) {
    return results.map((r) => `${mark[r.status] ?? r.status} (${r.project})`).join('<br>');
  }
  return entry.automation === 'manual' ? 'manual' : 'not yet automated';
}

const header = run
  ? `Run: ${new Date(run.stats.startTime).toISOString()} · ${run.stats.expected} passed, ${run.stats.unexpected} failed, ${run.stats.skipped} skipped`
  : 'No Playwright run found (e2e/results/results.json). Showing the automation plan only.';
const counts = { auto: 0, partial: 0, manual: 0, covered: 0 };
const rows = cases.map((entry) => {
  counts[entry.automation] += 1;
  if (outcomes.has(entry.id)) counts.covered += 1;
  const text = entry.text.replace(/\|/gu, '\\|');
  return `| ${entry.id} | ${entry.row} | ${text} | ${entry.automation} | ${resultCell(entry)} |`;
});
const lines = [
  `# QA sheet ${sheetVersion}: automated results`,
  '',
  header,
  '',
  '| ID | Row | Case | Automation | Result |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  `${cases.length} cases: ${counts.auto} automatable, ${counts.partial} partly, ${counts.manual} manual. Tests exist for ${counts.covered}.`,
  '',
  'Manual rows stay with the testers; everything else is filled in by the run.',
];
writeFileSync(reportPath, `${lines.join('\n')}\n`);
process.stdout.write(`${header}\nWrote ${path.relative(process.cwd(), reportPath)}\n`);

if (process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEET_ID) {
  process.stdout.write(
    'Google Sheets write-back is not implemented yet: it needs the sheet to carry an ID column ' +
      'and a service account shared on the sheet. The Markdown report above is complete.\n',
  );
} else {
  process.stdout.write(
    'Google Sheets write-back not configured (GOOGLE_SHEETS_CREDENTIALS, GOOGLE_SHEET_ID).\n',
  );
}
