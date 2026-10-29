---
title: GAB Leaderboard
colorFrom: blue
colorTo: gray
sdk: static
app_file: index.html
pinned: false
short_description: Gurbani Autopilot Bench results per STTM Voice-Follow build
---

# GAB leaderboard

One table: one row per version of Gurbani Autopilot (STTM Desktop Voice-Follow), newest at the top, with the % of time
the right Shabad or Bani is on screen for kirtan, paath and sung Bani (main GAB, practice split of the private dataset
`khalisfoundation/GurbaniAutopilotBench`; the held-out test set is never shown). Click a version to open a tree:
behaviour, then Gurdwara mic (main GAB) / Laptop mic (GAB-Hard), then each Bani, each with right % and wrong seconds
per hour, coloured across versions at the same place in the tree. The tree is built from the result rows, so a new
Bani or mic type appears without a page change. `?open=<commit>` opens one version.

Files: `index.html` (the page), `gab-names.json` (system name and each version's display name, by commit),
`results/index.json` + `results/<build>.json` (written by `gab publish`; `rows` = main GAB, `hard.rows` = GAB-Hard).
`timeline.html` + `timeline/index.json` + `timeline/<slug>-<set>.json`: every second of each practice recording coloured
right pangti / right Shabad, other pangti / wrong Shabad / nothing shown, with the true and shown pangti on hover and two
versions stacked to compare (`gab run` writes `timeline.json`, `gab publish` uploads it). `annotate.html`: a pangti
labeller that exports GAB answer keys (audio stays on the computer). Both follow Karanbir Singh's Live Captioning for
Gurbani Kirtan benchmark (github.com/karanbirsingh/live-gurbani-captioning-benchmark-v1), credited on the pages.
The page needs no token or secret.
