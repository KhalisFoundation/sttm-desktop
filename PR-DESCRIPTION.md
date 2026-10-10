## Why

#2226 added Voice-Follow to the experimental build as a hidden test mode. The team asked for it to be **visible and usable** by sevadaars, with a way to switch it off, while the background test recording keeps running when nobody is using it. This PR does that.

## What a sevadaar sees

- A **Voice-Follow button** in the sidebar and the Voice-Follow panel. Press Start and it listens to the kirtan and follows along on screen. Press Stop and it goes back to listening quietly for testing.
- An **"Experimental"** note in the panel: it can make mistakes, and it can be stopped at any time.
- Two switches in Settings: **Voice-Follow (experimental)** hides the button entirely, and **Voice-Follow Test Recording** turns the background recording off. Both are on by default.

## What the team gets

- **While nobody uses it**: exactly what #2226 collected. Hidden Voice-Follow scores itself against what the sevadaar shows, and the session uploads to Azure.
- **While a sevadaar uses it**: Voice-Follow is driving the screen, so there is no human to score against. Instead the session records every time the sevadaar **overrides** it by changing the Shabad or line by hand. Those stretches are marked in the data and left out of the accuracy score, and the override count is in the score file.

## Also in this PR

- The **8.7 engine**: Aarti is found and followed from any starting point (Renton Oct 5 recording: 93% → 99% right text; everything else unchanged on the Level 2 benchmark).
- The **redesigned panel**: live percentages, the next Shabads in contention, and a line showing what it is hearing.
- Voice-Follow and consent-card **styles** that the earlier merge had dropped.

## Test plan

Run on 2026-10-09 with the CI-built installer from this exact code.

| Step | Result |
|---|---|
| Fresh install, consent accepted | Button shows in the sidebar; background session starts at the first screen change and finds the Aarti in 8 s |
| Open the panel during the background run | Shows idle with Start and the experimental note, not the hidden run |
| Press Start | Hidden run stops, Voice-Follow takes the screen, follows line by line with live percentages |
| Change the Shabad by hand while it runs | Logged as an override; the score counts it |
| Press Stop | Hands back; the background run resumes on its own within 5 s |
| Stop then Start again | Works; no stuck state |
| Settings → Voice-Follow (experimental) off | Button disappears, setting saved; on brings it back |
| Session ends | All files in the Azure container; visible stretch excluded from accuracy, overrides counted |

🎬 **[Video, 5 min](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/visible-mode-installer-e2e.mp4)**: the CI-built Mac installer, fresh install, every step above, Azure listing at the end.

![Consent card](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-visible-consent.png)

![Panel idle while the background run is on](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-visible-hidden-idle.png)

![Voice-Follow driving the screen after Start](https://github.com/Arash2348/sttm-desktop/releases/download/test-videos-2026-10-08/shot-visible-visible-following.png)

CI: both installers build green on the fork (Mac arm64, Windows): [run 37866346647](https://github.com/Arash2348/sttm-desktop/actions/runs/37866346647). Engine check: on the eight Oct 5 Aarti clips the merged code makes the same Shabad decisions at the same moments as 8.7.

## Merge notes

Includes the two fixes from #2232 (arm64 Mac config duplicate keys; Voice-Follow styles), so it merges clean whether #2232 goes in first or not. Up to date with `experimental-release` as of 63634a75.
