# GAB: Gurbani Autopilot Bench

GAB is one named, repeatable test for STTM Voice-Follow. It plays the same recordings to any version of the app and
says, in a few numbers, how well the app kept the right Gurbani on screen. It uses saved speech-model outputs (the
cache), so a check takes seconds to minutes instead of hours, and the same build always gets the same numbers.

Dataset: Hugging Face `khalisfoundation/GurbaniAutopilotBench` (private). Tools: `research/level2-dataset/tools/`
on branch `vf-cached-replay` (`gab.js`, `gab-score.js`, `gab-harvest.js`, `gab-review.js`, `gab-publish.js`).
Version: every scorecard says `GAB v1.3`, its tier (`set`: main, hard or akhand) and the manifest hash it used. Leaderboard: the private Space
[khalisfoundation/GAB-leaderboard](https://huggingface.co/spaces/khalisfoundation/GAB-leaderboard) (static page; one
JSON per build; `gab publish` writes it).

## v1.3 (Oct 14 2026): the rest of the human sheet, and a third tier, GAB-Akhand Kirtan

The main tab of the Level-2 Google Sheet ("Human-Fully Sheet (100% Human Verified) - Level 2", 172 verified rows) was
only partly in GAB (the 41 L2 rows). v1.3 adds the other 131 rows, as Cycle 10 cut them (`gab-add-sheet-rows.js`,
suites `rfinds`, `yuba`, `l3` in vf-suites.js; truth files renton-finds-truth.json, yuba-jas.json,
level3-human-sheet.json, splits from splits-cycle10.json):

| group | clips (train / dev / test) | audio | tier | split rule |
|---|---|---|---|---|
| Renton Finds (full Renton darbars, Sep 25 reviewer) | 81 (50 / 18 / 13) | 10.85 h | main | Cycle 10 per recording; zuCiaw0exFA stays test |
| Gurdwara Yuba City (Jas Gurbani recordings) | 17 (0 / 0 / 17) | 2.55 h | main | Cycle 10's unseen-venue test, kept test (row 8, pDMz6_zhhDI, has no audio cut) |
| Level 3 smagams: AKJ Toronto 2022 Fri / Sat, Manchester 2024 Rehnsabhai | 32 (23 / 0 / 9) | 2.8 h | **akhand** | Toronto Saturday = test (Cycle 10 L3-test); Friday + Manchester = train |

Truth per clip (Shabad level, human; boundaries a few seconds approximate): the clip's own row, plus the earlier
main-tab row of the same recording where it reaches into the 30 s lead-in, so a Shabad change inside the clip is a
real switch (Renton darbars and smagams run Shabad after Shabad); the 10 s tail is left unlabelled. The user's ear-check
answers (clip-notes.json: also_correct, end_override_s, exclude) are applied. No line truth (lines.csv header only).
The 7 other rows of level3-human-sheet.json are repeat stretches of a Shabad already on the main tab: not added.

**GAB-Akhand Kirtan** (`--set akhand`, `gab akhand run|compare ...`): kirtan with many singers (5-15), the sangat singing
along, many instruments, a resonant sound. Tracked on its own (leaderboard column "Akhand Kirtan" and a branch in each
version's tree), never mixed with main GAB or GAB-Hard, never used to tune (level-3 policy). The rule is data, not ids
(gab-sets.json `tiers.akhand`): a manifest row joins when its gurdwara names AKJ / Akhand Kirtan / a Rehnsabhai, or its
notes carry `tags: akhand-kirtan`. Main GAB = every row in neither GAB-Hard nor GAB-Akhand Kirtan.

**Cache recorded on x86 (GCP vf-record).** These 130 clips had no cache entry, so their model output was recorded on
the GCP VM (Intel Xeon, linux-x64) for every published build, and pushed to the shared Azure bench-cache. x86 output
differs slightly from the Mac's (~0.9 % of frames flip argmax); one clip never mixes the two: each entry carries
`provenance.json` (platform, CPU, host; also in the Azure manifest entry), and vf-check refuses to record into an entry
of another platform (an entry without the stamp predates it and is a Mac entry). The manifest notes of each new clip
say "cache: recorded on x86". A build that later asks for new windows on these clips must be filled on x86 (the VM).

**v1.3 baseline, 9.0.3 release (3fafc0ba), practice split (train + dev), from cache:**

| tier / row | clips · audio | right Shabad | wrong s/h | find p50 / p90 (not found) | switches: within 10 s / later / never |
|---|---|---|---|---|---|
| main GAB, kirtan (L2-41 + Renton Finds) | 109 · 13.86 h | 92.6% | 111.2 | 7.2 / 32.3 s (13 of 109) | 18 / 2 / 1 (n 21) |
| &nbsp;&nbsp;L2-41 only (was the whole v1.2 kirtan row) | 41 · 5.19 h | 98.4% | 24.6 | 13.3 / 38.9 s (0) | none in these clips |
| &nbsp;&nbsp;Renton Finds darbars | 68 · 8.67 h | 89.3% | 159.7 | 0 / 18.9 s (13 of 68) | 18 / 2 / 1 (n 21) |
| GAB-Akhand Kirtan (AKJ Toronto Fri + Manchester) | 23 · 1.51 h | 78.2% | 398.3 | 5.8 / 38.1 s (7 of 23) | 6 / 1 / 3 (n 10) |

Switch p50 over found is 0 s: the sheet's Shabad starts are a few seconds approximate, and at many Renton changes the app
already shows the new Shabad when the marked start comes. The 132 old clips replay to exactly the published v1.2
numbers (scored on the GCP VM from the shared cache; identical screen events), so v1.2 -> v1.3 changes come only from
the new clips.

## Two tiers: GAB and GAB-Hard (v1.2, Oct 14 2026)

| tier | recordings | role |
|---|---|---|
| **GAB** (main, `--set main`, the default) | every practice row except GAB-Hard: Level-2 livestream kirtan (Darbar Sahib, Renton, Fremont livestream clip04-09), paath, Aarti and other sung Bani | the priority; what a build is judged on |
| **GAB-Hard** (`--set hard`, or `gab hard ...`) | Jaspal's STTM Desktop recordings at Gurdwara Sahib Fremont (`gurdwara` = "Gurdwara Sahib Fremont (Jaspal)", kh01-kh32, laptop mic in the hall): practice = kh11-kh32 (20 kirtan clips with a runner; kh16 Asa di Vaar and kh23 Aarti have no runner yet); kh01-kh10 are test, held out | tracked, not the priority |

**Why** (user decision, Oct 14 2026): the Fremont hall recordings are very hard (a resonant hall, the laptop mic far from
the ragis, little clean audio) and pulled the kirtan numbers around; they are their own category. The Fremont YouTube
livestream clips (clip04-09) are mixer feed and score like the rest of Level-2, so they stay in main.

Both tiers are data in `gab-sets.json` (`tiers`: hard = a gurdwara regex; main = every row in no other tier), so a
recording moves between tiers with one edit there. Splits are kept as they are (practice = train + dev; test held out
in both tiers). Never mixed: a scorecard is one tier; `gab compare` refuses two different tiers; `gab publish` takes
the main scorecard and the hard scorecard of the same build in their own slots, and each tier gets its own vs-base
verdict on the leaderboard. Named sets carry their tier (Fremont dev / train are hard-only rows).

**Consequence:** main GAB kirtan has no human line answers. The only main kirtan clip with line truth is clip05 (Fremont
livestream, aligner-made, unchecked: 45.7%), so the leaderboard shows "no line answers yet; right Shabad only" for main
kirtan. The same rule everywhere: a pangti %, same-or-neighbouring % or seconds-behind number is shown (and guarded by
`gab compare`) only on human or ear-checked line answers and at least 3 clips; otherwise it is information only. Main
paath and main sung Bani have 1 aligner-only clip each, so they read the same way.

**Same or neighbouring pangti** (new in v1.2, information only, never guarded): ON + CATCHING UP + BEHIND + AHEAD as %
of voiced time (the sangat-score buckets: right pangti, or one pangti behind or ahead). In kirtan the ragi sings two
pangtis as one phrase, and the sevadaar answer key marks the partner pangti as wrong. Strict pangti % stays the headline.

## The questions, in plain words (GAB v1.1, unchanged in v1.2)

Rows are the four behaviours (Kirtan of a Shabad; Bani recited; Bani sung like kirtan; Akhand Paath), the Banis under
them (the user's list; a Bani with no clip reads "no clips yet"), and the named clip sets of earlier reports
(`gab-sets.json`: L2-41, Fremont dev / train, paath-60, Aarti-50) so an old number can be checked on its own clips.

| question | what is measured |
|---|---|
| Is the right Shabad or Bani on screen? | % of the voiced time that a line of the Shabad/Bani being sung or read is on screen (the Shabad-level sangat view). Human answer keys for every clip |
| Does the sangat see the right pangti? | ON + CATCHING UP (the previous pangti < 1 s into a new one) as % of voiced time, on the best line truth the row has: **human** (sevadaar screen, a person) > **aligned, ear-checked** (our aligner + an ear check of sampled line starts; the audit is printed, rejected lines are never scored) > **aligned** (our aligner only; shown, never a headline). Clips with line truth where the app never showed anything are counted apart ("+N never shown"); that loss is in the first question and in "not found" |
| How many seconds behind is it? | same truth basis: a new pangti starts -> first on screen (p50 / p90, n pangtis) |
| How long is a wrong Shabad up? | seconds per hour that a line from a different Shabad or Bani is on screen |
| How fast does it find a Shabad? | the first Shabad/Bani of each clip. Clips cut from inside a performance (L2, paath, Aarti, Asa di Vaar: `coldFirst` in gab-sets.json) are timed from t=0, when the app starts listening ("cold": Start pressed while it is sung); others from the truth start. p50 / p90, n, not found |
| How fast does it switch? | every later Shabad/Bani that differs from the one before it (a piece of a Bani counts as the Bani), from its start to on screen, counted only when the screen showed something else as it began. Reported as **found within 10 s / found later / never found** plus p50 over the found ones (so never-found stays visible). A return to the main Shabad after a parmaan that the screen never left is **stayed on main Shabad** (correct; counted apart, never a 0 s switch). A **parmaan** (a Shabad quoted between two parts of another, or inside it) is its own count: shown / not shown |
| How much does each number rest on? | clips, hours, and the n under each number; fewer than 3 clips or events = **thin** |

Mic path (mixer feed / room mic / 50/50) stays as a second table. Which recording counts as which is in
`gab-micpath.json` (Fremont YouTube livestream = mixer feed; Jaspal's laptop recordings = room mic).
**Akhand Paath (Oct 15 2026):** `4-akhand-paath` is scored by suite `apaath` (`akhand-bench.js`: whole clip from t=0,
Bani routes on as in the app; manifest rows with `suite_jobs apaath:<id>`). The 10 YouTube Ang-after-Ang videos (ytap_*,
each at 1x and 1.35x) carry line answers from the publisher's burned-in pangti slides, frame-checked by an independent
verifier: their own line basis **publisher slides, frame-checked** (`broadcast-caption`), a headline basis like human
(not our aligner), so Lag shows on the leaderboard. Split by source video (sha1 of the video id, each x1.35 with its 1x):
6 train / 2 dev (cKpg64jaTAo, PB6nfe3QKn4) / 2 test (mUPs0SqeXvY, XEhUI8Vurj8), set on Oct 14 before any scoring (they
were all test). Akhand-only numbers in the scorecard line under the table: in sequence (right Shabad up) %, wrong % and
s/h, behind the reader p50/p90, pangtis reached of all labelled, and Shabad crossings (every next Shabad: seconds from
its first pangti to on screen, negative = already up during its header; crossing numbers are information in compare).
The Sehaj clips sp01-03 still have no times and no runner.

### v1.1 -> v1.2 (Oct 14 2026): tiers

Every per-clip number is unchanged (7 builds re-scored from the cached replays, both tiers; no new replay, no speech
model). What moved: the Fremont hall recordings left the main rows (kirtan 61 -> 41 clips; the old kirtan line number
47.7% now sits under GAB-Hard), the same-or-neighbouring column was added, and line numbers on aligner-only or thin line
answers no longer count in the guardrails (before, a 1-clip aligner-only drop could fail a build). The Fremont
reconciliation rows (64.0% -> 73.1% with line hold) reproduce exactly under GAB-Hard.

### v1.0 -> v1.1 (Oct 14 2026): why the v1.0 numbers did not match earlier reports

* **Sangat sees the pangti** (v1.0 37.6%): v1.0 averaged clips where the app never showed anything as 0% and mixed the
  train sessions in. Earlier reports (KIRTAN-GENERAL.md) leave never-shown clips out of the line number (their loss is
  in right-Shabad % and not-found). v1.1 does the same and prints the never-shown count: Fremont dev 64.0% (6 clips
  + 5 never shown), exactly the reported number.
* **Time to find** (v1.0 median 0 s): v1.0 timed from the truth window start, but L2 / paath / Aarti clips are cut from
  inside a performance (the 30 s before the window is the same Shabad), so the app was usually locked already. v1.1
  times those from t=0 (cold start) and keeps truth-start timing only where the Shabad really begins in the clip.
* **Switch time** is new (Shabad -> different Shabad inside a clip).
* **Switch rule fixed (Oct 14 2026, same day, after review; all 7 published builds re-scored from the cached replays,
  no other number changed):** the first v1.1 scorecards counted a return to the main Shabad after a parmaan as a
  switch even when the app never left the main Shabad (found at 0-1.5 s), and two truth rows of the same Shabad were
  treated as different Shabads, so kirtan read "1.5 s typical" while most new Shabads were never found. Now: returns
  the screen never left = "stayed on main Shabad"; parmaans counted apart (shown / not shown); switches reported as
  found within 10 s / later / never + p50 over found. 9.0.1 release, kirtan: 1 within 10 s / 2 later / 2 never
  (p50 17.9 s), 3 stayed on main, parmaan shown 1 of 6.
* **Ear checks** of aligned line starts are applied (sangat-score: a rejected start is never scored). The file
  `human-verdicts/line-start-check/verdicts.csv` on Hugging Face has 60 checked Renton Oct 11 line starts: 56
  confirmed, 3 unsure, 1 rejected (Rehras 23 of 25 confirmed + 2 unsure; Sohila 15 of 15; Aarti 18 of 20 + 1 unsure +
  1 rejected). Renton is in the test split, so this shows only in reconciliation runs, never on the leaderboard.
* **Excluded:** pt37, pt42, pt46 (their 30-60 s window is not Aarti; dataset truth to fix).
* **Headline:** per behaviour, no 50/50 mix in the headline; all-behaviours row is labelled "mixed; not a headline".

## Setup (any machine)

The tools run from this folder with Node 20 and the app's `node_modules` (link or install them at the repo root).
Everything machine-specific comes from the environment; the defaults are the paths under the home folder that the
original Mac used.

| variable | what | default |
|---|---|---|
| `VF_GAB_DATA` | benchmark data the tools read and write: answer keys and test lists (`*-tests.json`, `clip-notes.json`, `aarti/`, `renton-oct11/`, ...), `results/` | the folder above `tools/` |
| `VF_BENCHMARK` | local copy of the GAB dataset (`manifest.csv`, `<folder>/<id>/lines.csv`, `shabads.csv`, audio) | `~/personal/vf-benchmark` |
| `VF_CLIPS` | the clip audio (wav) the replay runners play | `~/personal/live-darbar-venues/clips` |
| `VF_EMIS_CACHE` | speech-model output cache (one folder per model and codec) | see `emis-cache.js` |
| `VF_MAIN_REPO` | app checkout that git revs (`gab run <rev>`) resolve in | `~/personal/sttm-desktop` |
| `VF_SPEECH_MODEL` | a speech model pack: a folder with `model.json` (`name`, `onnx`, `tokenizer`, `blank`, optional `frontend`/`io`; see the app's `engine/speech-model.js`). Every command runs that CTC model; the cache is keyed per model and scorecards name it | unset = the built-in Karanbir model |
| `MODEL` | path of the built-in model's ONNX (only when `VF_SPEECH_MODEL` is unset) | `~/AAI/models/karansea-shabad-ctc/model.int8.onnx` |

Two speech models on one build: run it once per model, then compare the saved scorecards:

    gab run <build> --tier smoke --out /tmp/gab-karanbir
    VF_SPEECH_MODEL=<pack> gab fill --root <build> --tier smoke --no-push   # model output for that pack (x86 machine)
    VF_SPEECH_MODEL=<pack> gab run <build> --tier smoke --out /tmp/gab-pack
    gab compare --cards /tmp/gab-karanbir/scorecard.json /tmp/gab-pack/scorecard.json --name-a karanbir --name-b <pack>

## Run it (one line)

```
cd ~/personal/sttm-replay/research/level2-dataset/tools
./gab run upstream                      # main GAB, smoke tier: 9 clips, < 1 min the first time, seconds after
./gab run ~/personal/<worktree> --tier full
./gab compare upstream ~/personal/<worktree> [--tier full]   # main GAB before/after, PASS only if no guarded number is worse
./gab hard upstream --tier full                              # GAB-Hard only (= gab run upstream --tier full --set hard)
./gab hard compare upstream ~/personal/<worktree> --tier full # GAB-Hard before/after (its own guardrails)
./gab akhand upstream --tier full                            # GAB-Akhand Kirtan only (= gab run upstream --tier full --set akhand)
./gab slowpc upstream ~/personal/<worktree>                   # simulated slow PC (timing only, never on the leaderboard)
./gab publish <main run>/scorecard.json --hard <hard run>/scorecard.json [--akhand <akhand run>/scorecard.json] --name "<build name>" --order N [--status candidate --base 2cb8b003]   # one row (both tiers) on the Space
./gab publish --batch batch.json        # every build in one commit (after a GAB version change); see gab-publish.js
```
`<build>` is a worktree or a git rev of `~/personal/sttm-desktop` (`upstream` = khalis/experimental-release).
`--manifest hf` scores against the manifest + answer keys on Hugging Face instead of the local copy
`~/personal/vf-benchmark`. `--folders 2-bani-recited/japji` narrows it. Output: `results/gab/<time>-run/scorecard.{md,json}`.

**INCOMPLETE (Oct 15 2026):** if any clip on either side did not replay (a CACHE MISS: the build asked the speech
model for windows the cache does not have, e.g. a lock or switch at a new moment starts the follower's windows at a new
offset; or a replay error), `gab run` / `gab compare` print `INCOMPLETE` with the clips listed, never PASS, and exit 3;
`gab publish` refuses such a scorecard. Before this, the missed clip was silently dropped from one side and the compare
could print PASS on unequal clip sets. Fill the missing windows (`gab fill`, or `vf-check --fill`) and rerun.

Guardrails (`gab compare`, per tier: main compare guards main only, `gab hard compare` guards hard only): each behaviour, all clips and per mic path (mixer, room, 50/50).
Worse beyond a tiny tolerance on any of right %, sangat-sees-pangti %, seconds behind, wrong s/h, time to find,
not found, switch time p50, switches never found = FAIL (switches found within 10 s is information only: a build that
stays on the main Shabad turns a switch into "stayed", so that count can drop for a better build). Pangti % and seconds behind
are guarded only on human or ear-checked line answers with at least 3 clips (v1.2), and same-or-neighbouring pangti is information only. Per-Bani rows, named sets and the mixed all-behaviours row are information only. The replay is deterministic, so
every change is a real change; the compare also lists the clips whose screen events differ.

Leaderboard page (Oct 14 2026 redesign): the system is shown as Gurbani Autopilot and each build by a plain name from
`gab-space/gab-names.json` (by commit; a build missing there gets '<Voice-Follow version> · <--name>'; edit the file and
`gab publish --site-only` to rename). Rows are ranked best first (right pangti where every row has human line answers,
else right Shabad), versions with identical shown numbers share one row, each column is coloured better/worse relative to
the other versions, and "In the app now" = the latest merged build by order. The verdicts below are shown only in the
"What changed between versions" tab, in plain sentences (no PASS/FAIL on the page); `--site-only` also refreshes the
dataset card's Leaderboard section when the names change.

Leaderboard verdicts: every `gab publish` recomputes, for every row and each tier separately, a "vs base" verdict with the same guardrails
(PASS / FAIL with the worse numbers listed): a candidate against the build it was made from (`--base`), a merged
build against the merged build before it (`--order`). Named clip sets that got worse (information only) are listed
under it. Page notes (clip counts, switch counts, which candidates come from which base) are generated from the
results files when the page loads, so adding a build never leaves stale text.

Speed: the first run of a new build replays every clip from the cache (no speech model): measured 48 s for smoke and
14 min for full (11 h of audio, 4 workers, the Mac at load average ~30 from other runs). A committed build that was
replayed before is reused: smoke 1-3 s, full 9 s. Uncommitted edits are always replayed.

## The split rule

Every recording session is in train, dev or test, decided once and never moved (`hf-ingest.js` RULE: one Gurdwara's
recordings < 2 h apart are one session; Fremont kh01-kh06 sessions pinned to test; others by hash 60/20/20).
`gab` without `--split` uses every row that is not test. `--split test` is the only way to see test numbers: use it
once, at the end, on the build you would ship. Never tune on test.

## How data gets in

1. **Recordings from Jaspal** (Fremont, STTM Desktop on the sevadaar's laptop): `./gab ingest` pulls new
   `khalisfoundation/sttm_desktop_*` datasets, converts them, assigns session + split, rebuilds the manifest.
   `./gab ingest --push` also uploads the new clip folders to the dataset.
2. **Cache:** `./gab fill` checks every clip: missing locally -> pulled from the shared Azure bench-cache; missing
   there too -> recorded with the speech model (bench lock, nice 19) and pushed to Azure. `./gab fill --plan` lists
   only. `gab run` / `compare` also pull from Azure first and never run the model.
3. **Real usage (harvest):** `./gab harvest` reads the Voice-Follow sessions in Azure (read-only). The sevadaar's
   screen is a human label that may lag. Developer sessions (Arashdeep, Jashandeep, Gauravjeet, test Gurdwaras) and
   testers with no real name are skipped unless `--include-dev` / `--include-unidentified`; their audio is never
   downloaded unless `--audio`. From each outside session it cuts the stretches where the sevadaar's line stayed put
   and the app agreed or disagreed (Voice-Follow hidden), and every sevadaar override (Voice-Follow visible), and
   queues them as short clips with both lines. `./gab harvest --list` shows every session and whether it is outside.
4. **Ear checks:** `./gab review` opens the yes/no page (app / sevadaar / both / neither / instruments only / not
   sure) on the harvest queue, or on any queue folder (`--queue <dir>` with items.json + clips/).
5. **Into the benchmark:** a harvested clip enters only after an ear-check answer, or when the sevadaar overrode the
   app. `./gab harvest --promote` writes those as clip folders (benchmark layout) into a staging folder.

## Add a recording in 3 steps

1. Put a 16 kHz mono WAV in `~/personal/live-darbar-venues/clips/` and its answer key (the Shabad/Bani and, if you
   have them, line start times made by a person) in the truth sheet of its kind (Jaspal-style recordings: just let
   `./gab ingest` do steps 1-2).
2. `node vf-benchmark-build.js` (adds the manifest row and clip folder), then `./gab fill` (pull or record its cache).
3. `./gab run upstream --tier full` shows it in the scorecard; `node hf-ingest.js --push-benchmark` uploads it.

## What is still manual

* Harvested clips have no replay runner yet: promoted clips sit in staging until a `harvest` suite exists.
* No outside (non-developer) session exists in Azure yet; harvest was proven on the Renton / Newton developer
  sessions with `--include-dev --no-audio`.
* Mic path for Fremont (room mic) and a few YouTube sources is assumed; confirm and edit `gab-micpath.json`.
