## 📖 Voice-Follow autopilot: follow singing, change Shabads on its own

Press Autopilot once. It listens, finds the Shabad being sung, follows line by line, and moves to the next Shabad when singing changes. Built for presenters running the projector while Kirtan flows.

## 📊 Benchmarks on large Kirtan sets

Harness rows grade the shipped judge settings (confirm 3, bar 0.65, 15-char floor). LEN15 is shipped behavior:

| Dataset | ✅ Right | ❌ Wrong | 🎯 Caught |
|---|---|---|---|
| ⏳ 86min live | 69.9% | 10.5% | 86 / 116 |
| 🎶 88, 20 voices | 64.7% | 17.4% | 78 / 87 |
| 🎵 51 clean | 73.6% | 14.2% | 49 / 50 |

| Dataset | ⚡ Speed | 🪫 Starved |
|---|---|---|
| ⏳ 86min live | 10.2s | 11 stuck |
| 🎶 88, 20 voices | 7.9s | 0 stuck |
| 🎵 51 clean | 5.4s | 0 stuck |

Policy checks on this tree (`npm run test:unit`):

| Check | Result |
|---|---|
| 🧪 Unit tests | 30 / 30 pass |
| 📋 Eval cases | 12 / 13 pass |
| ⚠️ Known limit | Spurious still commits |

## 🎯 North-star scorecard

| Star | Target | Now | Light |
|---|---|---|---|
| ✅ Right page | Higher | 69.9% live | 🟡 |
| ❌ Wrong page | Under 5% | 10.5% live | 🔴 |
| 🔒 Lock starves | Zero | 11 stuck | 🔴 |
| ⏳ Stale | Tolerable | 19.5% | 🟢 |
| ⚡ Speed | About 8s | 10.2s live | 🟡 |

Honest note on provenance: the harness grades the judge only. It cannot see the backstop, strong-wins, or list-hold, which are covered by the green unit and eval rows plus live feel. Live numbers on a large set are the next measurement to take.

## 📈 How each number moves, cheapest first

- ❌ Wrong page: the eval names the hole. Sustained-spurious matches still commit at 3. Small, bench-gated fix.
- 🔒 Starves: backstop adoption is the lever, already shipped. If the judge still will not commit on right lines, the 0.65 bar is the wall.
- 🎯 Caught: widen backstop rescore pool or lower its overlap floor, each step priced against false-jump risk.
- ⚡ Speed: strong-wins already cover decisive cases. The rest is acoustic floor, not code.
- 🎤 Above all of it: Kirtan-tuned acoustics. The bake-off showed about 50% is the model wall. Biggest win, biggest cost, after code plateaus.

## 📦 What's in this PR

- ⚙️ Feature code: detector, follower, switch judge, backstop, panel. Clean: zero TODOs, zero dead code, 30/30 tests green.
- 🎨 Panel styles, scoped to the feature. No app-wide restyling.
- 🔌 Small integration points: toolbar entry, overlay state, viewer hooks, model dependency.
- 🧪 Switch-policy tests plus eval harness so future tuning stays gated.

## 🔗 Where the numbers come from

- 🎬 Kirtan audio: [Shabad Gurbani With Meaning (Lyrics)](https://www.youtube.com/playlist?list=PLnnODsM2enUaj15N8rLldcIJKhNM6nFlN), a 729-video playlist by [Shabad Gurbani Audio](https://www.youtube.com/@ShabadGurbaniAudio). 32 of the 38 finder A/B tracks come from it; the other 6 are three targeted YouTube clips studied individually (Chaupai: `21Zth-_kn-w`, ajan: `mSA0H-jCXuo`, Sohila: `H5pWQGfVDvU`, each watchable at `https://www.youtube.com/watch?v=<id>`) plus three slow-sung control clips.
- 🧪 KPI harness and datasets: `handoff/benchmark/run_kpis.sh` plus `handoff/benchmark/vf-kirtan-switch-eval.js` and the `handoff/benchmark/kirtan_*.json` manifests, all in this PR.
- 🧪 Policy gates: `www/main/addons/voice-follow/components/switchPolicy.test.js` and `switchPolicy.eval.js` (run with `npm run test:unit`).
