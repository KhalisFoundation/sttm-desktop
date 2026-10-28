# Speech-model hearing benchmark (Voice Autopilot)

Compares speech models on one question: **does the right Shabad come up from what the model heard?** Every model hears
the same audio windows. Its transcripts go through the app's own Gurbani search, and the result is scored per
behaviour. Everything is pinned (clips, models, search corpus, library versions), so a re-run gives the same numbers.

## Run it

```bash
cd research/model-bench
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export HF_TOKEN=...            # a token that can read the khalisfoundation org
PY=.venv/bin/python ./run.sh 8 # 8 model runs in parallel (4 threads each); about 1 h on a 32-core x86 VM
```

Node 18+ is needed for `score.js`. Run it from a checkout of this repo: it loads the app's own search code from `www/`.
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
  - For paath, the truth is a whole Bani (`bani:<id>`), and any Shabad of that Bani counts as right.
- **Usable.** The share of windows whose text has at least 8 letters. Below that, the app does not search.
- **30 s vote.** The Shabad that was top-1 most often over the last 30 s (at least 3 times and in the clear lead) is
  right or wrong. This is a simple, logic-free view of hearing over time.
- **Truth.** The `shabads.csv` row covering 2 s before the window ends. Truth is never made with a speech model: it
  is human labels or the broadcaster's own on-screen captions. Rows aligned with a model (`aligned-*`, made with
  Karanbir's model) are excluded, and so is the one clip that only had such labels, because they would favour that
  model.
  - Truth comes only from the benchmark's human labels, never from any model.
  - Truth files and audio are the benchmark's own, at revision `0b307522287c6ea1a9773ee8a620707b2b7e9f84`.

**Behaviours (47 clips, 12,442 s).** Kirtan (mixer feed; hall laptop mic), Akhand Kirtan, paath (hall; studio), Bani
sung as kirtan, and Akhand Paath. Clips are capped at 300–600 s; see `sample.json`.

**Not measured here.** How the full app performs with a model: Shabad switching, following lines, lag, and settings
tuned for that model. This benchmark isolates hearing. In earlier tests, a model that heard better did not always do
better in the app.

## Why other runs give different numbers

The same model can score very differently depending on these choices:

| Choice | Here | Effect if different |
|---|---|---|
| Window length | 10 s (the app's), also 4 s | 4 s windows score far lower for every model, and much lower again for models trained on whole pangtis |
| What counts as right | the true Shabad found by the app's search | CER/WER on whole pangtis cut at true line boundaries measures something else (transcription accuracy, not finding) |
| v2 front-end | v1's fbank + normalisation (`make_v2_frontend.py`) | the published v2 ONNX takes features, not audio. Feeding it audio fails, and a different fbank gives worse text |
| Clips | the 47 in `sample.json`, at a fixed benchmark revision | other clips or tiers give other numbers |
| Paath truth | a whole Bani counts any of its Shabads | scoring paath by single Shabad id makes every model look near 0 |
| Batch | 1 window at a time | batching pads windows and changes per-utterance normalisation |

## Published results (x86-64, 32-core Intel Xeon VM, the pinned requirements)

RESULTS_PLACEHOLDER
