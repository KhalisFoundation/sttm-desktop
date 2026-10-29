#!/bin/zsh
# vf-ci.sh [base rev] — the nightly cached-replay check (called by .github/workflows/vf-nightly-replay.yml,
# runnable by hand). Replays the chosen tier for <base rev> vs this checkout from the emissions cache on
# this machine (no model runs; a cache miss fails the run unless VF_CI_FILL=1, which records under the
# bench lock) and prints report.md (+ the GitHub step summary when present). Uploads nothing: the report
# holds metrics and clip names only (no audio, no model outputs, no secrets).
set -u
HERE=${0:A:h}
ROOT=${HERE:h:h:h}
BASE_REV=${1:-${VF_BASE_REV:-origin/dev}}
TIER=${VF_TIER:-full}
OUT=${VF_CI_OUT:-$ROOT/research/level2-dataset/results/vf-ci/$(date +%Y%m%d-%H%M)}
[ -e $ROOT/node_modules ] || ln -s ${VF_NODE_MODULES:-$HOME/personal/sttm-desktop/node_modules} $ROOT/node_modules
FILL=(); [ "${VF_CI_FILL:-0}" = 1 ] && FILL=(--fill)
node $HERE/vf-check.js --base-rev $BASE_REV --cand $ROOT --tier $TIER --out $OUT $FILL
rc=$?
if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f $OUT/report.md ]; then
  { echo "## Voice-Follow cached replay ($TIER tier): $BASE_REV vs $(git -C $ROOT rev-parse --short HEAD)"; echo; cat $OUT/report.md; } >> $GITHUB_STEP_SUMMARY
fi
exit $rc
