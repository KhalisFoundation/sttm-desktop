// Test titles start with the QA sheet's case ID, so the report can be read
// back against the sheet (see scripts/sheet-report.mjs).
const cases = require('../cases.json');

const byId = new Map(cases.cases.map((entry) => [entry.id, entry]));

/** "SRCH-01 Guru Granth Sahib: Search: “qnjqnh”, …" — the ID, then the sheet's own words. */
function sheetCase(id, summary) {
  const entry = byId.get(id);
  if (!entry) throw new Error(`${id} is not in e2e/cases.json`);
  return `${id} ${summary || entry.text}`;
}

module.exports = { sheetCase, sheetCases: cases.cases };
