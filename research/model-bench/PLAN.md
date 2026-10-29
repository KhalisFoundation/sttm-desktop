# Plan: one way to benchmark speech models for Voice Autopilot

Making a model? Start with [MODEL-GUIDE.md](MODEL-GUIDE.md).

Goal: Jaspal's runs, our runs and anyone's Claude produce the **same numbers** for the same model, and every
number says what it measures. Proposed Oct 28 2026; open for Jaspal's edits.

## Three levels, each answering its own question

| Level | Question | Metric | Tool | Time |
|---|---|---|---|---|
| 1. Transcription | How accurately does the model write down a pangti? | WER, CER (jiwer), plus edge-tolerant CER | `wer.py` | about 30 min on a Mac |
| 2. Finding | Does the right Shabad come up from what it heard? | hit@5 / hit@1 through the app's own search, 10 s windows | `infer.py` + `score.js` | about 1 h on 32 cores |
| 3. Feature | Does the app with this model follow the sangat better? | GAB replay through the full app (switching, following, lag, wrong Shabads), then a live test | GAB harness | hours |

Level 1 is Jaspal's training loop. Level 2 decides whether a model is worth wiring in. Level 3 decides whether it ships.
A model moves up a level only if no behaviour is **clearly** worse than Karanbir's model (the 95% interval excludes 0)
at the level below, and its latency at 2 threads is no worse.

## Rules everyone follows

1. **One harness.** Numbers come from this folder at a named commit, run with `run.sh` / `wer.py`. Every result file
   records the commit, model sha256, GAB revision, library versions and CPU, so two runs can be compared line by line.
2. **One machine type for published numbers:** x86-64 Linux (the GCP benchmark VM, or any x86 box). Apple arm64 gives
   slightly different text.
3. **One model interface.** Every model is published as int8 ONNX that takes 16 kHz audio (`audio`, `audio_len`) and
   returns `log_probs`, `out_len`, plus its SentencePiece file. v2 needs a front-end cut out of v1 today; v3 should be
   exported with the front-end inside.
4. **Fixed text rules.** Reference text is the pangti from BaniDB by verseId, never edited. Scoring removes the same
   things from both sides (NFC, ॥ । digits, punctuation, extra spaces). Long pangtis are cut into equal parts of at
   most 20 s for every model.
5. **Truth that no model made.** Only human labels or the broadcaster's own captions. Labels aligned with a speech model
   (`aligned-*`) are never used: they favour the model that cut them.
6. **Splits.** GAB's own split is the rule: `train` may be trained on, `dev` is for tuning and checking, `test` is only
   for reported numbers. Nothing in dev or test is trained on.
7. **Do-not-train list.** `gab-do-not-train.csv` lists all 330 GAB dev and test recordings with their source (YouTube
   id and time, or the khalisfoundation Hugging Face dataset). 23 of them are org `sttm_desktop_*` datasets that a
   training run could pick up by accident, including 6 clips in this benchmark. Check training data against it
   before every training run.

## Gaps found while writing this plan

| Gap | Effect | Fix |
|---|---|---|
| The 47 clips mix GAB splits (28 dev, 12 test, 7 train) | fine for comparing today's models; wrong for a model tuned on dev | v2 of the benchmark: report on GAB `test`, keep dev for Jaspal's tuning |
| `aa05` is a later cut of the same Aarti as `aa01` | that Aarti counts twice in sung Bani | drop `aa05` in v2 (WER is unaffected: its timings are model-aligned, so it is already excluded) |
| Human pangti timings exist only for kirtan hall-mic, studio paath, part of sung Bani and Akhand Paath | WER/CER has no kirtan mixer feed, Akhand Kirtan or hall paath yet | label pangti start/end by hand on the GAB test clips of those behaviours (the labelling tool already exists) |
| Kirtan repeats pangtis and adds alaap; caption times run about 0.5 s late | plain WER/CER on exact label times punishes correct hearing (CER over 100% on hall kirtan) | edge-tolerant CER next to plain: 1 s padding, neighbouring words free, pangti repeated 1-4 times; long term, tighter human timings |
| WER/CER uses only the hit@5 part of each clip (300-600 s), dropping about half the human and caption pangtis | fewer pangtis than available | v2: score the full recordings |
| 4-clip behaviours give weak intervals (hit@5 calls v2's Akhand Paath lead "clear" on 4 clips) | over-confident calls | v2 on GAB test adds clips; WER already needs 5+ to call "clear" |
| Training overlap with Karanbir's model is unknowable (data unpublished) | his numbers on broadcast clips may be optimistic | report kirtan with and without Darbar Sahib recordings |

## Order of work

1. Merge this harness (PR #2289) with `wer.py` and the do-not-train list. Jaspal runs `./run.sh` and `wer.py` on x86 and
   confirms he gets the same numbers.
2. Benchmark v2 on GAB test (new `sample.json`, same scripts); publish as the reference table.
3. Hand-label pangti timings for the missing behaviours on GAB test clips.
4. v3: Jaspal tunes on Level 1 using GAB dev; candidates go to Level 2 on GAB test; the best goes to Level 3 and a live
   test.
