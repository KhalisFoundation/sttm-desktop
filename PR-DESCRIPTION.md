## Why

Voice-Follow listens to the kirtan through the laptop microphone and follows along on screen. Before sevadaars see it, we want to know how well it does in real Gurdwaras. This PR adds it in a **hidden "shadow" mode**: it runs silently, records the audio and what the sevadaar shows by hand, scores itself against that, and uploads the result for the team to study. The sevadaar's experience does not change.

## What's in it

- **Voice-Follow MVP 8.6**, hidden. No button, no panel.
- **Shadow recording.** On first launch a consent card asks for the tester's name and Gurdwara. Nothing is recorded or uploaded before it is accepted, and it can be switched off in Settings. Sessions start on their own when the sevadaar puts something on screen and stop after 8 idle minutes.
- **Uploads go to Khalis's Azure storage** (the `voice-follow-training-data` container), straight from the app, using the access token Gauravjeet issued. Audio is about 14 MB per hour. Uploads resume after a restart or a dropped connection.

## One setup step

The access token is not in the code. The build fills it in from a repository secret named **`VF_UPLOAD_SAS`**. Please add that secret to this repository (Settings → Secrets and variables → Actions) with the token. Without it the build still works, the app just won't upload.

As before, the 184 MB speech model needs to be downloaded in the build pipeline before packaging. The URL and the step are in the tester-build workflow on `Arash2348/sttm-desktop`.

## Test plan

Run on 2026-10-08. CI build of this exact code is green on macOS and Windows: [run 37744089265](https://github.com/Arash2348/sttm-desktop/actions/runs/37744089265).

### 1. Fresh install, end to end, with the CI-built Mac installer

🎬 **[Video, 5 min](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/azure-upload-e2e-installer.mp4)**

| Step | What happens |
|---|---|
| Install and open | Fresh machine state. The app downloads its database by itself; the speech model is bundled. |
| Consent card | Enter a tester name and Gurdwara, accept. |
| Put a Bani on screen | A session starts. A real Aarti recording plays as the microphone. |
| Audio ends | The session stops on its own and every file appears in the Azure container (shown at the end of the video). Sizes read back from Azure match the laptop byte for byte. |
| Inside the session | Hidden Voice-Follow found the Aarti and followed its lines, while the screen stayed on what the "sevadaar" chose. |

![Consent card](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-consent.png)

![Session running](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-following.png)

![Azure container after the session](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-listing.png)

### 2. Same flow from source

🎬 **[Video, 5 min](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/azure-upload-e2e-dev-build.mp4)**. Same result.

### 3. Also covered

- Kill the app mid-session: the files upload at the next launch.
- Lose the network: uploads resume within a minute of it coming back.
- Switch the setting off: nothing is recorded.
- Build checks pass, and the built app contains the token with no placeholder left behind.

## Merge notes

Merged with the latest `experimental-release`; the three conflicts were resolved keeping both sides' intent.

This build uses the standard app identity and publish settings, so the experimental channel's release script renames it, publishes it and auto-updates it like any other experimental build. The arm64 Mac config bundles the speech model.
