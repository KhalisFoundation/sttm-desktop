# Speech-model hearing benchmark (Voice Autopilot)

Compares speech models on one question: **does the right Shabad come up from what the model heard?** Every model hears
the same audio windows. Its transcripts go through the app's own Gurbani search, and the result is scored per
behaviour. Clips, models, the search corpus and the speech libraries are pinned by revision and sha256. On x86-64 a
re-run gives the same numbers; other CPUs (e.g. Apple arm64) give slightly different text and so slightly different numbers.

## Run it

```bash
cd research/model-bench
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export HF_TOKEN=...            # a token that can read the khalisfoundation org
PY=.venv/bin/python ./run.sh 8 # 8 model runs in parallel (4 threads each); about 1 h on a 32-core x86-64 VM
```

Node 18+ is needed for `score.js`. Run it from a checkout of this repo: it loads the app's own search code from `www/`,
and records that code's commit and file hashes in `results.json`.
`run.sh` does four steps, and each can also be run alone:

| Step | Command | Output |
|---|---|---|
| 1. Fetch (about 1.4 GB) | `python fetch.py` | `data/` - 47 clips from GurbaniAutopilotBench at a fixed revision, 4 models, search corpus, Bani lists (all sha256-checked) |
| 2. Transcribe | `python infer.py --model jaspal-v2 --win 10` | `transcripts/jaspal-v2-w10/<clip>.jsonl` (one line per 1 s window) |
| 3. Score | `node score.js --md results.md` | the tables below |
| 4. Latency | `python latency.py 4` (then `2`) | ms per window, set up like the app |

To test a new model, give `infer.py` any ONNX that takes 16 kHz audio (`audio [1, samples]`, `audio_len`) and returns
`log_probs` and `out_len`: `python infer.py --onnx v3.int8.onnx --spm bpe.model --blank 0 --name jaspal-v3-w10 --win 10`.
Then re-run `score.js`.

## What is measured

- **Windows.** Each clip is cut into overlapping windows of `--win` seconds, one every second. 10 s is what the app's
  recognizer hears; 4 s is shown as well. Each window is decoded alone: greedy CTC, blank dropped, SentencePiece decode,
  as in each model card's own script.
- **hit@5 (headline) and hit@1.** The window's text is searched with the app's search
  (`engine/retrieval/text-index.js`) over the pinned corpus. A window is a hit if the true Shabad is the top result
  (hit@1) or among the top 5 distinct Shabads (hit@5).
  - The same Gurbani appearing in another Shabad counts as right (the app's `sameGurbani`).
  - For paath, the truth is a whole Bani (`bani:<id>`), and any Shabad of that Bani counts as right. This measures
    "found the Bani", not "found the place in it". Bani sizes range from 3 to 242 Shabads; text from unrelated kirtan
    audio hits a Bani's Shabads only 0.3-5.6% of the time, so this does not inflate scores much.
- **Weighting and uncertainty.** hit@5 is window-weighted, so long clips count more; the per-clip average is shown
  next to it. Windows overlap, so the real sample size is about the number of clips. "vs baseline" is the difference
  from Karanbir's model at the same window, with a 95% interval from resampling whole clips. Only differences marked
  "clear" (the interval excludes 0) should be read as real.
- **Usable.** The share of windows whose text has at least 8 letters. Below that, the app does not search.
- **30 s vote.** The Shabad that was top-1 most often over the last 30 s (at least 3 times and in the clear lead) is
  right or wrong. This is a simple, logic-free view of hearing over time.
- **Truth.** The `shabads.csv` row covering 2 s before the window ends. Truth is never made with a speech model: it
  is human labels or the broadcaster's own on-screen captions. Rows aligned with a model (`aligned-*`, made with
  Karanbir's model) are excluded, and so is the one clip that only had such labels, because they would favour that
  model. 39 clips use human labels and 8 (the YouTube paath and Akhand Paath ones) use the broadcaster's captions.
  - For a clip marked `coldFirst`, the first Shabad counts from 0 s (a listener knows the Shabad from the first
    line). This affects about 20 windows each on two kirtan clips, equally for every model.
  - Truth files and audio are the benchmark's own, at revision `0b307522287c6ea1a9773ee8a620707b2b7e9f84`.

**Behaviours (47 clips, 12,442 s).** Kirtan (mixer feed; hall laptop mic), Akhand Kirtan, paath (hall; studio), Bani
sung as kirtan, Akhand Paath (4 natural-speed clips), and Akhand Paath sped up 1.35x. The sped-up tier is shown
separately because it is synthetic and one of its two clips repeats a natural-speed clip. Clips are capped at 300-600 s;
see `sample.json`. Some tiers are dominated by a few long clips (e.g. two Renton recordings are 88% of paath-hall
windows); compare the per-clip average too.

**Caveats.**
- Every model is tested as its published int8 ONNX.
- Training overlap with these clips is unknown for both Karanbir's model (training data unpublished) and Jaspal's. The
  YouTube clips are the kind of broadcast material either could have trained on.
- **jaspal-v2 is provisional.** Its model card describes an audio-input graph, but the file takes features (see the
  table below). The author should confirm the file and its front-end.

**Not measured here.** How the full app performs with a model: Shabad switching, following lines, lag, and settings
tuned for that model. This benchmark isolates hearing. In earlier tests, a model that heard better did not always do
better in the app.

## Why other runs give different numbers

The same model can score very differently depending on these choices:

| Choice | Here | Effect if different |
|---|---|---|
| Window length | 10 s (the app's), also 4 s | 4 s windows score far lower for every model, and much lower again for models trained on whole pangtis |
| What counts as right | the true Shabad found by the app's search | CER/WER on whole pangtis cut at true line boundaries measures something else (transcription accuracy, not finding) |
| v2 front-end | v1's fbank + normalisation (`make_v2_frontend.py`) | the published v2 ONNX takes features, not audio. Feeding it audio fails, and un-normalised features give much shorter, less accurate text |
| Clips | the 47 in `sample.json`, at a fixed benchmark revision | other clips or tiers give other numbers |
| Paath truth | a whole Bani counts any of its Shabads | scoring paath by single Shabad id makes every model look near 0 |
| Batch | 1 window at a time | batching pads windows and changes per-utterance normalisation |
| CPU | x86-64 | arm64 (Apple) gives slightly different text: same ranking, small differences in the numbers |

## Published results (x86-64, 32-core Intel Xeon VM, the pinned requirements)

Transcripts come from `./run.sh 8` on a fresh clone of this branch, scored with this branch's `score.js`. They were
byte-identical (376 of 376 clip files) to an earlier independent run, so the numbers reproduce on x86-64. An independent
re-implementation of the scorer matched every hit@5 number.

**hit@5 %, 10 s window** (window-weighted, with the per-clip average in brackets). Full table, including 4 s windows,
hit@1 and the 30 s vote: `results.md`.

| Behaviour (clips) | Karanbir | v0 | v1 | v2 (provisional) | v2 vs Karanbir, 95% CI |
|---|---|---|---|---|---|
| Kirtan, mixer feed (7) | 69.3 (68.9) | 39.5 (39.9) | 46.2 (46.3) | 70.5 (72.4) | +1.2 [-1.7, 5.7] not clear |
| Kirtan, hall laptop mic (7) | 20 (19.9) | 0.1 (0.1) | 1.5 (1.5) | 9.7 (9.7) | -10.3 [-16.4, -4.8] **clear** |
| Akhand Kirtan (7) | 40.2 (39.7) | 4.5 (4.4) | 10.7 (10.4) | 27.7 (27.7) | -12.5 [-16.9, -7.6] **clear** |
| Paath (hall) (6) | 93.6 (85.6) | 84.9 (57.3) | 86.3 (63.8) | 89.7 (59.4) | -3.9 [-41.9, 0.6] not clear |
| Paath (studio) (8) | 86.5 (85.1) | 41.5 (64.5) | 56 (70.7) | 79.5 (79.6) | -7 [-14.9, 1.1] not clear |
| Bani sung as kirtan (6) | 72.4 (76.6) | 38.3 (39.7) | 46.9 (50.4) | 67.1 (72.8) | -5.3 [-10.8, 0.6] not clear |
| Akhand Paath (natural speed) (4) | 97.5 (97.4) | 97.6 (97.6) | 99 (99) | 98.9 (98.9) | +1.4 [0.8, 2.5] **clear** |
| Akhand Paath sped up 1.35x (2) | 85.7 (84.9) | 74.1 (72.8) | 84.8 (83.7) | 92.7 (92.2) | +7 [3.1, 11.4] **clear** |

**Reading it.**
- Karanbir is clearly better on hall laptop mics and Akhand Kirtan.
- v2 is clearly better on Akhand Paath. The natural-speed gap is small (all models are at 97-99%), and it is larger
  when sped up.
- Kirtan (mixer feed), paath and sung Bani show no clear difference between Karanbir and v2 on these clips.
- v0 and v1 are clearly behind on everything except Akhand Paath.

**Latency** (`latency.py`; same machine, set up like the app):

| ms per window (median) | Karanbir | v0 | v1 | v2 (+ front-end) |
|---|---|---|---|---|
| 10 s, 4 threads (the app on 8+ cores) | 233 | 185 | 215 | 179 |
| 10 s, 2 threads (the app on < 8 cores) | 380 | 232 | 238 | 231 |
| 4 s, 4 threads | 97 | 76 | 79 | 75 |
| Load time | 0.6 s | 3.3 s | 3.8 s | 1.5 s |
| Size | 184 MB | 155 MB | 155 MB | 157 MB |
