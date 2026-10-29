#!/bin/zsh
# Opt-in git hook: run the cached smoke tier (no model, < 1 min) after each commit.
#   install:   ln -s ../../research/level2-dataset/tools/vf-smoke-hook.sh .git/hooks/post-commit   (in a worktree:
#              git rev-parse --git-path hooks/post-commit tells you where); uninstall: delete that link.
#   base:      VF_SMOKE_BASE=<release worktree> (default ~/personal/sttm-replay). Never blocks the commit.
HERE=${0:A:h}
H=$HERE; [ -f $H/vf-check.js ] || H=$(git rev-parse --show-toplevel)/research/level2-dataset/tools
CAND=$(git rev-parse --show-toplevel)
BASE=${VF_SMOKE_BASE:-$HOME/personal/sttm-replay}
OUT=${TMPDIR:-/tmp}/vf-smoke-$(git rev-parse --short HEAD)
# runs in the background (it takes the bench lock like every replay, so it may wait for a running benchmark)
echo "[vf-smoke] cached smoke tier queued: $BASE vs $CAND -> $OUT/report.md (log $OUT.log)"
mkdir -p $OUT
nohup node $H/vf-check.js --base $BASE --cand $CAND --tier smoke --out $OUT > $OUT.log 2>&1 &!
exit 0
