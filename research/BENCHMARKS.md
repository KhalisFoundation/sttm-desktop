# Benchmarking Voice Autopilot: the model and the harness

Two separate questions, two tools. Developer-only: nothing under `research/` ships in the installers.

| Question | Tool | Where | Time |
|---|---|---|---|
| **Model:** how well does a speech model hear Gurbani? (finds the right Shabad from 10 s of audio; WER / CER; speed) | `model-bench` | `research/model-bench/` (this branch) | about 1 h on 32 x86 cores |
| **Harness:** how well does the whole app keep the right Gurbani on screen with a given build? (right Shabad %, sangat sees the pangti %, seconds behind, wrong Shabad s/h, time to find, switches) | GAB, the Gurbani Autopilot Bench | `research/level2-dataset/tools/` on branch `gab-tools-handoff` of github.com/Arash2348/sttm-desktop (not yet on experimental-release; a separate PR) | seconds to minutes from the cache |

A model that hears better is not always better in the app (settings were tuned on Karanbir's model), so a candidate
model goes through both: model-bench first, then GAB with the app pointed at it. The bar for each step is in
[model-bench/MODEL-GUIDE.md](model-bench/MODEL-GUIDE.md) section 5; the plan in [model-bench/PLAN.md](model-bench/PLAN.md).

## 1. Model benchmark (model-bench)

```bash
cd research/model-bench
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export HF_TOKEN=...                 # reads the khalisfoundation org on Hugging Face
PY=.venv/bin/python ./run.sh 8      # fetch (1.4 GB) -> transcribe -> hit@5 (score.js) -> WER/CER (wer.py) -> latency
```
Node 18+ for `score.js`. Output: `results.md`, `results-wer.md`, `results.json` (with every pinned revision and hash).
Published numbers are from x86-64 Linux; Apple arm64 gives the same ranking within about 0.5 points. A new model:
`python infer.py --onnx <file> --spm <tokenizer> --blank <id> --name <name>-w10 --win 10`, then `node score.js`.
Details, results and why other runs differ: [model-bench/README.md](model-bench/README.md).

## 2. Harness benchmark (GAB)

GAB replays recorded clips through the real app (Electron, headless) and scores what the screen showed against human
answer keys. The speech model's output per window is cached (locally, and in the shared Azure `bench-cache`), so a run
never waits for the model and the same build always gets the same numbers.

Needs: a checkout of the GAB tools branch beside the app, Node 18+, `~/.vf-hf-token` (HF, khalisfoundation org), and
`~/.vf-azure-sas` (read access to the shared cache; ask Arash). Dataset: `khalisfoundation/GurbaniAutopilotBench` (private).

```bash
cd research/level2-dataset/tools
./gab run upstream                                   # main GAB, smoke tier (9 clips): < 1 min
./gab run <worktree or git rev> --tier full          # one build, all main-GAB clips (train + dev); --split test only at the end
./gab compare upstream <build> --tier full           # before / after; PASS only if no guarded number got worse
./gab hard compare upstream <build> --tier full      # GAB-Hard (hall laptop mic); ./gab akhand ... for Akhand Kirtan
./gab fill --root <build>                            # record model windows the cache lacks (Mac or the GCP x86 VM), push to Azure
```
Output: `results/gab/<time>-run/scorecard.{md,json}`; `gab publish` puts a row on the leaderboard Space
`khalisfoundation/GAB-leaderboard` (private; public summary at `khalisfoundation/GAB`). Full reference: `GAB.md` next to
`gab.js`.

**Testing another speech model in the harness.** Today the app engine loads only Karanbir's model and vocabulary
(`www/main/addons/voice-follow/engine/infer.js`: `assets/vocab`, blank id 256). For another model: point `MODEL=<onnx>`
at it, add its vocabulary, then `gab fill` (the cache is keyed by model sha, so a new model records its own windows once),
and `gab compare` against the same build with Karanbir's model. Making the engine load any model's tokenizer is open
work (MODEL-GUIDE.md section 7).

## 3. Rules that keep both honest

- Answer keys never come from a speech model (`aligned-*` rows are excluded from headline numbers).
- GAB `train` may be trained on; `dev` is for tuning; `test` only for reported numbers. Do-not-train list:
  `model-bench/gab-do-not-train.csv`.
- Every scorecard records the build commit, GAB version, manifest hash, model sha and machine, so two numbers are
  comparable or clearly not.
- A change (model or harness) is accepted only if no behaviour gets clearly worse.
