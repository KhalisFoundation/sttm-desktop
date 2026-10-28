#!/bin/bash
# run.sh [jobs] - the whole benchmark: fetch -> transcribe (4 models x 4 s and 10 s windows) -> score -> WER/CER -> latency.
# jobs = how many model runs in parallel (each uses 4 threads); default 1. Re-running skips finished clips.
set -euo pipefail
cd "$(dirname "$0")"
JOBS=${1:-1}
PY=${PY:-python3}
$PY fetch.py
for w in 10 4; do for m in karanbir jaspal-v0 jaspal-v1 jaspal-v2; do echo "$m $w"; done; done |
  xargs -P "$JOBS" -L 1 sh -c "$PY infer.py --model \$0 --win \$1 > /dev/null"
node score.js --md results.md --json results.json
$PY wer.py --md results-wer.md --json results-wer.json
$PY latency.py 4 && $PY latency.py 2
