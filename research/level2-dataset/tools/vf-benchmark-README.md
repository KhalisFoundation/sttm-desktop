---
pretty_name: Voice-Follow benchmark (SikhiToTheMax desktop)
license: other
language:
  - pa
task_categories:
  - automatic-speech-recognition
tags:
  - gurbani
  - kirtan
  - paath
  - sikhitothemax
  - voice-follow
  - benchmark
configs:
  - config_name: manifest
    data_files: manifest.csv
    default: true
---

# Voice-Follow benchmark v0.1

Private, reusable benchmark for the **Voice-Follow** feature of SikhiToTheMax desktop: the app listens to the
hall microphone and puts the Gurbani being sung or read on the screen, line by line, and moves to the next
Shabad when the kirtan changes. Every clip here is real audio with truth for *what was sung or read, when*, so
any build of the app (or any other follower) can be scored the same way, from a manifest, in minutes.

v0.1 = {{N_CLIPS}} clips, {{HOURS}} clip hours ({{UNIQUE_HOURS}} hours of unique audio; the Aarti and Newton sets cut
the same recordings at several start points). Level 3 (the sealed set) is **not** in this dataset.

## The four questions, and how each is scored

| # | plain-language question | metric(s) on the scorecard | where it comes from |
|---|---|---|---|
| 1 | **Did it find the Shabad quickly, and was the wrong page ever up?** | found within 10 s (count / clips), wrong-page time (% of the truth window, longest wrong stretch s), never found | per-clip `shabads.csv` truth vs the screen events |
| 2 | **Is it on the right line, or turning to it?** | line exact %, line within 1 %, lines reached | `lines.csv` (aligned or human line truth) vs the line shown |
| 3 | **How many seconds behind the singer is the screen?** | line lag median s (typical) and p90 / worst stretch off the line | first time the shown line = the truth line, minus the truth line start |
| 4 | **When the kirtan moves to a new Shabad, how long until the screen follows, and does it ever switch to something wrong?** | seconds to the new Shabad (per target), wrong switches (count) | `shabads.csv` targets (onsets) vs the first time that Shabad is on screen |

A clip only answers the questions its truth supports: a Shabad-level clip (kirtan sheet rows) answers 1 and 4;
a line-level clip (forced-aligned Bani, Fremont operator timeline) also answers 2 and 3. The scorecard marks
every other cell **not measured** rather than guessing.

## Content folders

```
1-kirtan-shabad/            kirtan of a Shabad, incl. darbar recordings with several Shabads (switching is scored inside)
2-bani-recited/<bani>/        a Bani read as paath: japji, jaap, tav-prasad-savaiye, chaupai, anand-40, rehras, sohila,
                            salok-kabeer, salok-fareed, salok-m9 (a folder with no recordings holds a README saying so)
3-bani-sung-like-kirtan/<bani>/         a Bani sung like kirtan: aarti, asa-di-vaar, rehras-sung, saloks-sung
4-akhand-paath/             continuous reading across Shabads (Sehaj paath proxy)
```

Each clip folder `<clip-id>/` holds:

* `audio.wav` — 16 kHz mono PCM16.
* `lines.csv` — `verseId,start_s,end_s,confidence,source`: one row per line of Gurbani with its time in the clip.
  `source` is `human` (an operator's timeline) or `aligned` (forced alignment of the known text; `confidence` is the
  aligner's per-line check score, scorers use rows with check >= 0.6). Header only when no line truth exists yet.
* `shabads.csv` — `shabadId,start_s,end_s,source`: the Shabad (BaniDB shabad id) or Bani (`bani:<id>`) being sung or read
  over that window. Copies of the same Gurbani that all count as right are written `51|2533|bani:22`. Empty times
  (Sehaj paath) mean the order is known but the onsets are not.
* `meta.json` — id, content folder, Bani, gurdwara, reader, acoustics (`hall` | `studio` | `laptop-mic`), origin, duration,
  split, truth provenance, the replay-suite job(s) that score it, whether the model-output cache has it, notes.

`manifest.csv` has one row per clip with the same fields (plus the audio path).

## Coverage

{{COVERAGE}}

Gaps: the three read-salok folders (`salok-kabeer`, `salok-fareed`, `salok-m9`) and `rehras-sung` have no recordings
yet; `4-akhand-paath` has three 10-minute Sehaj paath studio clips only (order truth, no onsets). Akhand paath hall
audio, and anyone reading the saloks as paath, are the next recordings to collect.

## Splits

* **test** = real production and user sessions: Renton Oct 11 (`rt11_*`), Fremont (`kh*` in a TEST session, incl.
  kh01-kh06), Newton Oct 11 (`nw11_*`), the Oct 13 user test (`ut13_*`). **Never tune on these**; they are only run for
  the final number of a build.
* **Fremont sevadaar-screen recordings (`kh*`)** are split by RECORDING SESSION (one darbar = recordings of one
  Gurdwara less than 2 h apart), never by clip: `hf-ingest.js` decides a session's split once (kh01-kh06's sessions
  pinned to test; every other session by a salted hash, 60 / 20 / 20 train / dev / test per Gurdwara) and freezes it
  in `hf-jaspal/ledger.json`, so new recordings join a split automatically and nothing ever moves. **train** = tune on,
  **dev** = check while iterating, **test** = once, at the end. The `session` column names the session.
* **dev** = everything else (the Level-2 kirtan sheet clips, the paath playlist clips, the Renton Aarti cuts, the
  YouTube Asa di Vaar, the Sehaj paath clips).

Level 3 stays out of this dataset (sealed, held by the user).

## Provenance

* **Level-2 kirtan (`clip01`-`clip41`)**: the Google Sheet "Human-Fully" tab is the human source of record (every row
  verified by ear); `human-fully-sheet.json` in the app repo is its export, and `clip-notes.json` carries the user's
  spoken corrections (clip22 id corrected to 4563; clip04 is a two-Shabad weave, both right). Clips are cut 30 s
  before the truth window and 10 s after it, from the YouTube live darbar linked in `origin`.
* **Paath (`pt*`)**: `paath-tests.json` (Bani from the video title, most rows "pending" a by-ear confirmation).
  The YouTube Aarti rows (`pt35`-`pt53`) are sung Aarti and live under `3-bani-sung-like-kirtan/aarti`; they are scored both as a
  paath row (Bani opened?) and as an Aarti clip.
* **Aarti (`aa*`)**: `aarti-tests.json`; Renton Wednesday / Friday / Sep 27 / Sep 25 hall test / Oct 5 recordings,
  cut at several start points so cold starts inside the Aarti are scored; piece truth from the Renton manifests.
* **Fremont (`kh*`)**: Jaspal's app-recorded sessions (Hugging Face `khalisfoundation/sttm_desktop_*`, pulled
  incrementally by `hf-ingest.js`); line truth = the line the sevadaar put on screen while it was sung
  (provenance "sevadaar screen (human, may lag)": the screen follows the singing, usually a little late). Morning Asa
  di Vaar and Aarti recordings are filed under `3-bani-sung-like-kirtan/`.
* **Renton Oct 11 (`rt11_*`)**: the app's own session audio from the Gurdwara PC; Bani parts forced-aligned
  (Rehras realigned at extra-long with the app's own verse ids), kirtan onsets from `kirtan-targets.json`.
* **Newton Oct 11 (`nw11_*`, `ytasa1`)**: Khalsa School Newton session (hard audio: 11 % of lines clearly heard)
  and a YouTube Asa di Vaar; forced-aligned line truth, his taps as the Shabad truth.
* **User test Oct 13 (`ut13_s90`, `ut13_s91`)**: two shadow recordings of the same singing by two app builds; truth
  from the PC's live transcript and the human log.
* **Sehaj paath (`sp01`-`sp03`)**: `paath-seq-tests.json`; truth = every Shabad on the Angs read, in order.

Forced alignment = the Renton follower-bench aligner (`research/follower-bench/emis.js` + `align.js`) driven by
`tools/line-truth.js`; it uses the same recognition model as the app, so its low-confidence lines (check < 0.6) are
listened to before they are trusted and are not scored.

## Running a build on it

`tools/` in this repo is a snapshot of the replay harness pieces that score a build from this manifest
(`vf-check.js --manifest`, the suite definitions and scorers, the truth sheets). See `tools/RUNNING.md` for the
exact commands, what else the harness needs (an app checkout, its node_modules, the BaniDB Realm, the model file,
the model-output cache) and how to pull or rebuild the cache. Short form:

```
node tools/vf-check.js --manifest hf:khalisfoundation/GurbaniAutopilotBench --cand <app worktree> --folder 3-bani-sung-like-kirtan/aarti
node tools/vf-check.js --manifest manifest.csv --cand <app worktree>            # the whole benchmark
```

Output: `scorecard.json` + `scorecard.md` with the four questions per content folder, every cell either a measured
number or `not measured`.

## Scores

One table per build. **measured** = the number was produced on this Mac by the suite scorers named above;
**(VM)** = measured on the GCP x86 VM (model output differs slightly from the Mac's); **not measured** = no run.
Where a cell has several numbers they are the suite's own metrics, listed in the order of the question's column.

### MVP 9.0.1 (PR 2238) — `vf-mvp-9.0.1` @ 5f594b8b = MVP 9.0 @ 4ff68d0d + the copy-aware following-phase switch judge

Numbers from `research/level2-dataset/results/MVP-9.0.md` (final, sttm-release) and `LOCK-9.0.1.md`. 9.0.1 changes
only decodes where the two top full-text leaders tie exactly and are copies of one text; every suite replayed for the
lock was event-identical to 9.0 except the rows marked.

| content folder | clips | 1. found quickly / wrong page | 2. right line | 3. seconds behind | 4. new Shabad / wrong switches |
|---|---|---|---|---|---|
| `1-kirtan-shabad` — Level-2 kirtan 41 (dev) | 41 | **measured** (9.0, copy-aware rescore): found <= 10 s 36/41, <= 20 s 39/41, never 1; right page 97.55 %, wrong 0.84 %, longest wrong 120.1 s. 9.0.1: identical on 38/39 cached clips; clip35 right 97.52 %, wrong 1.15 %, longest wrong 9.2 s (So Purakh reached 27 s earlier) | not measured (no line truth yet except clip05) | not measured | **measured**: switches inside the 41 single-Shabad clips are wrong-page time (above); no multi-Shabad targets |
| `1-kirtan-shabad` — Fremont kh01-05 (test) | 5 | **measured** (9.0 = 9.0.1, identical events): Shabad right 86.1 %, wrong 4.6 %, searching 9.3 % | **measured**: line same (arbiter) 46.6 %, with singing credit 47.3 %, within 1 66.3 %, verses reached 54/85 | **measured**: median line lag 3.1 s | not measured as a target time; flips counted in the suite |
| `1-kirtan-shabad` — Renton kirtan1 / hukamnama (test) | 2 | **measured** (9.0 = 9.0.1, identical): 2053 on screen at 9.3 s; Hukamnama 3048 at 3945.2 s (sung 3913.8 → 31 s); wrong page 0 s in these two parts | not measured | not measured | **measured**: Hukamnama 31 s after the first read word; no wrong switch |
| `1-kirtan-shabad` — Newton kirtan2-4 (test) | 3 | **measured** (session replay with his taps): taps, interleaved Shabads and Bani open identical to base | not measured | not measured | **measured**: identical to base (nw-score "shabads" rows) |
| `1-kirtan-shabad` — ut13_s90 / s91 (test) | 2 | **measured** (ut13-bench, real model): every stretch right; see 4 | not measured | not measured | **measured** (9.0 → 9.0.1): Aarti after Shabad 1839: never → +1.7 s (s90), never → +0 s (s91); So Dar cold after 5299: +1.6 s (s90), never → +3.6 s (s91); no new wrong switch |
| `2-bani-recited/*` — paath rows pt01-34, 54-65 (dev) | 47 (of the 60-row suite incl. the Aarti rows) | **measured** (9.0, Bani-aware, whole 60-row suite): right Bani 67.8 %, sub-Bani 3.2 %, member Shabad 5.1 %, wrong page 2.9 %, nothing on screen 15.0 %; per Bani right text Japji 85 %, Jaap 69 %, Chaupai 93 %, Savaiye 93 %, Anand 94 %, Rehras 93 %, Sohila 92 %. 9.0.1 **(VM)**: Bani 70.1 %, wrong 2.9 %, none 14.1 % (pt29 now opens Sohila) | not measured (line truth only on pt54) | not measured | n/a (one Bani per clip) |
| `2-bani-recited/rehras` — rt11_rehras (test) | 1 | **measured** (9.0 = 9.0.1): right Bani 98.3 %, wrong page 0 % | **measured**: line exact 78.0 %, within 1 94.5 %, lines reached 380/390 | **measured**: median 0.4 s, p90 1.0 s; 3 stretches > 5 s off the line (longest 32.5 s) | n/a |
| `2-bani-recited/sohila` — rt11_sohila (test) | 1 | **measured**: right Bani 99.8 %, wrong 0 %; Sohila 49 on screen 0.3 s after the first word | **measured**: line exact 84.1 %, within 1 94.8 % | **measured**: median 0.4 s, p90 0.9 s | n/a |
| `3-bani-sung-like-kirtan/aarti` — aa01-50 + pt35-53 (dev) | 50 rows, 45 scored | **measured** (9.0 @308b58cb; 9.0.1 identical on the 21 cached clips replayed): right (Aarti text up) 85.3 %, wrong page 0.2 %, nothing 14.5 %; found 43/45, within 60 s 39/45 | **measured**: piece exact 60.2 %, heard line 73.2 % | not measured | **measured**: wrong switches 2 |
| `3-bani-sung-like-kirtan/aarti` — rt11_aarti (test) | 1 | **measured** (9.0 = 9.0.1): right Bani 98.0 %, wrong page 0 %; Aarti 51 on screen at 26.2 s, Bani 22 at 121.5 s **(VM)** | **measured**: line exact 31.9 %, within 1 45.8 % | **measured**: median 2.3 s, p90 3.3 s | **measured**: Rehras → Aarti handover (rt11_handover, ut13-bench): never inside the stretch (Aarti at +95 s) → **+3.9 s** in 9.0.1 |
| `3-bani-sung-like-kirtan/asa-di-vaar` — Newton part 1 / part 2 (test) | 2 (+ session) | **measured** (9.0): Bani open identical to base | **measured**: part 1 within one line 66.7 %, exact 43.0 %, lines reached 56/83; part 2 within one line 27.3 %, reached 9/30 | **measured**: part 1 median 2.0 s, p90 5.8 s, > 1 line behind 30.8 %, no stall (base 229 s) | not measured |
| `3-bani-sung-like-kirtan/asa-di-vaar` — ytasa1 (dev) | 1 | not measured | **measured**: within one line 97.2 %, lines reached 158/160 | **measured**: left a line early 2 (base 0); median lag 0.45 s | n/a |
| `3-bani-sung-like-kirtan/saloks-sung` — rt11_fareed1 / fareed2 (test) | 2 | **measured** (9.0 = 9.0.1): 5299 on screen at 527.4 s (sung from 544: before the first sung word, locked from the intro quote); 5238 at 1039.3 s (sung 1028.5 → 10.8 s); wrong page 12.3 s (3442 in Fareed 1) | not measured | not measured | **measured**: 10.8 s to 5238; one wrong switch (3442, 12.3 s) |
| `4-akhand-paath` — sp01-03 (dev) | 3 | not measured on 9.0.1 (sequence bench lives on the akhand-paath branch; these clips have no cache entry) | not measured | not measured | not measured |
| `2-bani-recited/salok-*`, `3-bani-sung-like-kirtan/rehras-sung` | 0 | no recordings | | | |

Slowed-PC stress (Renton's 0.85x real-time engine), MVP 9.0: audio waiting to be decoded bounded at 1.7 s (Rehras),
1.4 s (Aarti), 0.9 s (kirtan) vs 154 / 159 / 73 s and growing on the Oct 11 build; Rehras median line lag 1.2 s,
p90 1.8 s, lines reached 118/121. These are live-paced runs and are not reproduced by the cached replay.

### Runner proof — `vf-check --manifest --folder 3-bani-sung-like-kirtan/aarti`, MVP 9.0.1 branch head b1c9afab, from the cache

`scores/mvp-9.0.1-b1c9afab/3-bani-sung_aarti/scorecard.md` (+ `.json`): 61 suite jobs over 49 of the folder's 52 clips
(aa21, aa22 are the Sep 27 windows after the Aarti ended; rt11_handover has no suite job), 147 min of audio replayed in
2.5 min with no model run, scored in 3 s. Aarti suite on the Renton cuts: right 85.3 %, wrong 0.2 %, nothing 14.5 %,
found 43 / within 60 s 39, piece exact 60.2 %, heard line 73.4 %, wrong switches 2 — the MVP 9.0 numbers above except
heard line (73.2 → 73.4). Renton rt11_aarti: Bani right 98.5 %, wrong 0 %, line exact 32.5 %, within 1 46.2 %, lag
median 2.4 s, p90 3.7 s — these differ from the 9.0 row (98.0 / 31.9 / 45.8 / 2.3 / 3.3); the cause (branch head vs the
lock commit, the harness revision, or the committed copy of the truth) is not established. The 15 YouTube Aarti rows
scored as paath rows: Bani 52.2 %, wrong 11.6 %, none 17.3 % (the 60-row suite reports 2.9 % wrong overall; the wrong
time here is pt42 and pt46, windows the Aarti sheet marks as not Aarti).

## Versioning

v0.1 (2026-10-13): first assembly from the clips and truth on the benchmark Mac. Truth files are copied as of that
date; corrections go to the Human-Fully sheet / the JSON exports in the app repo first, then a new version here.
