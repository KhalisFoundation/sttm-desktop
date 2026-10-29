// folder-names.js — the benchmark's content folder names (renamed Oct 14 2026, user's choice) and the old names,
// accepted as aliases when reading (older manifests, ledgers and results still score).
//   1-kirtan-shabad              kirtan of a Shabad (incl. darbars)            (unchanged)
//   2-bani-recited/<bani>        a Bani read aloud           (was 2-paath-bani/<bani>)
//   3-bani-sung-like-kirtan/<b>  a Bani sung like kirtan     (was 3-bani-sung/<bani>)
//   4-akhand-paath                                                              (unchanged)
//   5-akhand-kirtan               Akhand Kirtan smagams: many singers, sangat singing along (Oct 16 2026, user's choice;
//                                 these were in 1-kirtan-shabad; the GAB-Akhand tier rule still finds them by gurdwara)
const ALIASES = [[/^2-paath-bani(?=\/|$)/, '2-bani-recited'], [/^3-bani-sung(?=\/|$)/, '3-bani-sung-like-kirtan']];
const canonFolder = (f) => ALIASES.reduce((s, [re, to]) => s.replace(re, to), String(f || ''));
const TOP = ['1-kirtan-shabad', '2-bani-recited', '3-bani-sung-like-kirtan', '4-akhand-paath', '5-akhand-kirtan'];
module.exports = { canonFolder, TOP, ALIASES };
