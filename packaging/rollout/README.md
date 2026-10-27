# Staged rollout by state / region / area

Automatic update checks first read `rollout.json` from the release bucket
(`https://sttm-releases.s3.us-west-2.amazonaws.com/rollout.json`). The menu's
"Check for updates" always ignores it.

## One-time setup
1. Deploy `geo-worker.js` as a Cloudflare Worker (free plan). It answers
   `{ "country": "US", "region": "US-CA" }` from Cloudflare's own lookup of the connection; nothing is stored.
2. Ship one normal release containing this code. Older installs ignore the rollout file.

## Each release
Upload `rollout.json` to the bucket root (public-read, like `latest.yml`), using
`rollout.example.json` as the template:

```json
{ "version": "9.1.0", "regions": ["US-CA", "US-WA"], "geoUrl": "https://sttm-geo.arash2348.workers.dev" }
```

- `regions`: ISO 3166-2 codes (`US-CA`, `CA-ON`, `GB-ENG`) or a whole country (`CA`, `GB`).
- `areas` (optional): `{ "name": "Fresno", "lat": 36.74, "lon": -119.78, "km": 60 }` allows PCs within
  `km` of the point. Locations from the internet address are often 20-50 km off (e.g. a Renton PC
  shows as downtown Seattle), so use 50 km or more. Neighbouring cities can't be told apart reliably.
- A PC updates if it matches any region **or** any area.
- To widen: add regions. To release to everyone: delete `rollout.json` (or empty it).
- Combine with `stagingPercentage` in `latest.yml` for "California, 20%".

## Behaviour
| Situation | Result |
|---|---|
| No / unreadable `rollout.json` | Updates normally |
| App already on `version` or newer | Updates normally |
| Region listed, or inside an area | Updates |
| Region not listed | Waits; re-checks on next launch |
| Location service down | Waits; re-checks on next launch |

The decision is logged in `main.log` as `[rollout] ...`.
