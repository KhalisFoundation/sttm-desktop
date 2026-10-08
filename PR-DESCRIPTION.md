## Why

Voice-Follow listens to the kirtan through the laptop microphone and follows along on screen, using an on-device speech model. Before it is shown to sevadaars, we want to know how well it does in real Gurdwaras. This PR adds Voice-Follow in a **hidden "shadow" mode**: it runs silently, records the audio and what the sevadaar shows by hand, scores itself against that, and uploads the result for the team to study. The sevadaar's experience is unchanged.

## What's in it

- **Voice-Follow MVP 8.6** under `www/main/addons/voice-follow/` (Cycle 8 kirtan following, same-Gurbani lock, Sundar Gutka paath following).
- **Shadow layer** under `www/main/addons/voice-follow/shadow/`. The Voice-Follow button and panel are not shown. On first launch a consent card asks for the tester's name and Gurdwara; nothing is recorded or uploaded before it is accepted, and it can be switched off in Settings ("Voice-Follow Test Recording"). Sessions start on their own at the first screen change and stop after 8 idle minutes.
- **Uploads go to Khalis's Azure Blob container** `voice-follow-training-data` (account `banidb`), straight from the app with a container SAS that allows create, write and list only. Layout: `raw/<gurdwara>/<tester>/<date>/<session>/` with the audio (Opus/WebM, ~14 MB per hour), both timelines and a score file. Uploads resume after a restart or a dropped connection.

## One thing to set up before the experimental build

The SAS is **not committed**. After `npm run build`, `packaging/inject-upload-sas.js` (the `postbuild` script) writes it into the compiled config from the `VF_UPLOAD_SAS` environment variable. `build-mac.yml` and `build-windows.yml` in this PR pass that variable from a repository secret.

**Add a repository secret `VF_UPLOAD_SAS`** (Settings → Secrets and variables → Actions) with the container SAS. Without it the build still succeeds; the app just does not upload.

Also, as before: the 184 MB speech model must be fetched into `build-resources/voice-follow/model.int8.onnx` before packaging (URL in `.github/workflows/tester-build.yml` on `Arash2348/sttm-desktop@mvp-8.6c-shadow`), and `packaging/electron-builder.macArm.yml` needs the same `extraResources` entry.

## Test plan

Everything below was run on 2026-10-08. The CI tester build of this exact code is green on macOS (arm64) and Windows: [run 37744089265](https://github.com/Arash2348/sttm-desktop/actions/runs/37744089265).

**1. Installer end to end (macOS, the CI-built DMG, fresh install)** — [video, 5 min](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/azure-upload-e2e-installer.mp4)
1. Install from the DMG with an empty user-data folder; the app downloads the database itself and the speech model is bundled.
2. Consent card appears; enter a tester name and Gurdwara, accept.
3. Put a Bani on screen (Anand Sahib from Quick Insert). A session starts. A real Aarti recording plays as the microphone.
4. After the audio ends the session stops on its own, and every file lands in the Azure container (listing shown at the end of the video). Sizes read back from Azure match the local files byte for byte.
5. Hidden Voice-Follow inside the session found the Aarti Bani and followed its lines (`system.jsonl`), while the screen stayed on what the "sevadaar" chose.

**2. Same flow from source (dev build)** — [video, 5 min](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/azure-upload-e2e-dev-build.mp4). Same result.

**3. Resilience** (code paths, exercised in earlier tester builds): kill the app mid-session → files upload at the next launch; drop the network → uploads resume on the next minute tick; switch the setting off → no recording.

**4. Build checks**: `npm run build` and `eslint` clean on the shadow folder; the compiled config contains the SAS and no placeholder (the tester workflow fails the build otherwise).

**What a reviewer can check without running anything**: `www/main/addons/voice-follow/shadow/uploader.js` (the PUT), `config.js` (the placeholder), `packaging/inject-upload-sas.js`, and the two workflow files.

## Merge notes

Merged with `experimental-release` as of 49959e84. Conflicts resolved: the two easy-peasy store files keep upstream's removal of `return state` (same fix both sides), and `viewerApp.jsx` keeps upstream's `ViewerContent` inside our `ErrorBoundary`.

Open from before: app identity (`org.khalisfoundation.sttm.voice` / `Voice-Sikhi-To-The-Max`, updater off) versus the standard identity for the experimental channel. Say which you want and I'll change it on this branch.
