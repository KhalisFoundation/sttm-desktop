# Model guide: how to make a speech model that is good for Voice Autopilot

For anyone training a model for STTM Voice Autopilot (Jaspal, Sukhpal, Surinder, Karanbir, anyone). It says what the app
needs, what to aim for, how to check your own model before handing it over, and the bar it must clear. Draft of
Oct 28 2026; edit freely.

## 1. What "good" means here, in order

1. **Finds the right Shabad, fast,** in each of the five behaviours: kirtan Shabad, paath of the main Banis, Bani sung
   as kirtan, Shabad switching, Akhand Paath. This is what the sangat sees.
2. **Stays quiet during talk, katha and simran.** A model that writes Gurbani-looking text during katha makes the
   app show wrong Angs. Silence or non-Gurbani text there is correct.
3. **Hears the words accurately** (CER / WER on what was actually sung, see section 4).
4. **Is fast enough on an ordinary Gurdwara Sahib computer** (section 2).

Better hearing (3) usually helps (1), but does not guarantee it: a model can have lower CER and still find Shabads
more slowly (seen with Surinder's model in October). So (1) is always measured directly.

## 2. What the app can run (the interface)

| Item | Requirement |
|---|---|
| Format | ONNX, int8 preferred (fp32 accepted for testing), runs on onnxruntime CPU |
| Input | `audio` float32 16 kHz mono, `audio_len`; the feature front-end (mel etc.) **inside** the model |
| Output | `log_probs` (frames x vocab, CTC), `out_len`; state which id is the blank |
| Tokenizer | SentencePiece model file published next to the ONNX |
| Length | must accept at least 20 s of audio; the app listens in windows of about 4-10 s |
| Speed | no slower than Karanbir's model at 2 threads: about 380 ms per 10 s window on the benchmark machine (`latency.py 2`) |
| Size | about 200 MB or less (installers bundle the model) |
| Licence | allows use in STTM (MIT / Apache style); say what data it was trained on |

## 3. Data rules (so the test stays fair)

- **Never train on** anything in `gab-do-not-train.csv` (GAB dev + test). GAB `train` is fine.
- **Never train on** Shadower / STTM session recordings from **Oct 28 2026 onwards**: they are the fresh test set no
  model has seen.
- Publish the list of recordings you trained on (or a held-out list we can test on). A model is never scored on
  recordings it was trained on.
- Labels: point each line to its pangti by **verseId** (BaniDB). Do not retype or edit Gurbani. When only part of a
  pangti was sung, record which words (start word, end word) and the times. Mark simran, katha and talk as
  not-Gurbani.

## 4. Check your own model before handing it over (about 1-2 h)

```bash
cd research/model-bench
python fetch.py                      # pinned clips, models, scoring files
# add your model to MODELS in infer.py (repo, file, tokenizer, blank id)
./run.sh                             # finding score (hit@5) per behaviour, vs Karanbir's model
python wer.py --models karanbir,<yours>   # hearing: WER / CER per behaviour
python latency.py 2                  # speed at 2 threads
```

Tune on GAB **dev** only. Reported numbers come from GAB **test**, run by us, on x86-64 Linux.

## 5. The bar, step by step

| Step | Test | Pass if | Who / time |
|---|---|---|---|
| A. Quick | hit@5 per behaviour + latency (section 4) | no behaviour clearly worse than Karanbir's model (95% interval below 0), latency no worse | model maker, 1-2 h |
| B. Hearing | CER on sung-words labels: GAB test, a held-out part of Sukhpal's reviewed set, fresh Shadower recordings | same or better than Karanbir's model on most behaviours; ranking holds on every set | us, a few hours |
| C. Harness | full-app replay on a fixed set of about 20 clips across the five behaviours, after a small threshold tuning on dev **for each model** | sangat view (on the right pangti or catching up) no worse in any behaviour, wrong-Ang time no worse | us, a few hours |
| D. Live | owner live test, then a tester build | owner prefers it | owner |

A model that passes A is worth our time for B and C. Only C and D decide what ships.

## 6. Where models need to get better (from today's numbers)

- **Hall laptop mic kirtan** (noisy room, far microphone): Karanbir's model is clearly ahead. Train with hall audio or
  added room noise and reverb.
- **Akhand Kirtan:** Karanbir's model is clearly ahead on finding.
- **Akhand Paath (fast reading):** Jaspal's v2 is slightly ahead; keep this strength.
- **Talk / katha / simran:** include these as training examples with no Gurbani output.
- **Short windows:** the app decides from 4-10 s of audio, so models should do well on short clips, not only full
  pangtis.

## 7. What still needs building (us)

- Step C needs the app engine to load another model's vocabulary and blank id (today it assumes Karanbir's) and a replay
  cache per model. Until then, step A is the quick test.
- Sung-words labels: convert Sukhpal's reviewed data (text matching to verseId + words, people check the unsure
  lines) and mark repeats on GAB test clips.
