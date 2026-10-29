#!/bin/bash
# run-variant.sh — rank Voice Autopilot variants on the GCP GAB replay farm (x86 cache, no model, no Azure).
#
#   run-variant.sh <git-ref-or-worktree> [<more variants> ...] [--set main|hard|akhand] [--split dev|test|train|train,dev]
#                  [--base <git-ref-or-worktree>] [--ids <id prefixes, e.g. clip02,pt01>] [--fill] [--keep-vm-running] [--tag <label>]
#
# Each variant: its app files (www + test/voice-follow + package.json, uncommitted edits included for a worktree) are
# copied to the VM, then `gab compare <base> <variant> --tier full --set <set>` runs there against the farm's x86 cache
# (~/farm/cache-x86). All variants run in parallel (each replay uses <= 4 workers). Scorecards come back to
# ~/personal/gcp-farm/results/<time>-<tag>/<variant>/ (compare.md, compare.json, scorecard-A/B.json).
# Exit 0 = every variant PASS, 1 = some FAIL, 3 = some INCOMPLETE (a cache miss: never a verdict).
# --fill: a variant that misses is recorded on the VM (x86, the variant's own windows, VF_ORT_THREADS=2) into the farm
#         cache and compared again; the output says how many clips needed it. Never while the farm build runs.
# Default base = 3fafc0ba (the release the cache was built from). Default set = main, split = dev (train + dev).
# The VM is started if it is stopped (keeps its 6 h self-stop). It is NOT stopped afterwards: other agents use it;
# stop it yourself when the farm is idle (see READY.md).
set -euo pipefail
GC=~/google-cloud-sdk/bin/gcloud
ZONE=us-east1-b; PROJ=vf-bench-sttm; VM=vf-record
REPO=~/personal/sttm-desktop
FARM_LOCAL=~/personal/gcp-farm
vm() { "$GC" compute ssh "$VM" --zone "$ZONE" --project "$PROJ" --command "$1" 2> >(grep -v -e 'Warning: Permanently' -e 'Updating' -e 'Waiting for SSH' >&2); }

IDS=''; SET=main; SPLIT=dev; BASE=3fafc0ba; FILL=0; TAG=variants; VARIANTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --set) SET=$2; shift 2;;
    --split) SPLIT=$2; shift 2;;
    --base) BASE=$2; shift 2;;
    --fill) FILL=1; shift;;
    --ids) IDS=$2; shift 2;;
    --tag) TAG=$2; shift 2;;
    --keep-vm-running) shift;;
    -h|--help) sed -n 2,20p "$0"; exit 0;;
    *) VARIANTS+=("$1"); shift;;
  esac
done
[ ${#VARIANTS[@]} -gt 0 ] || { sed -n 2,20p "$0"; exit 2; }
case "$SET" in main|hard|akhand) ;; *) echo "--set main|hard|akhand"; exit 2;; esac

# --- VM up -------------------------------------------------------------------------------------------------------
st=$("$GC" compute instances describe "$VM" --zone "$ZONE" --project "$PROJ" --format='value(status)')
if [ "$st" != RUNNING ]; then
  echo "VM is $st: starting it (6 h self-stop stays) ..."
  "$GC" compute instances start "$VM" --zone "$ZONE" --project "$PROJ" >/dev/null
  for i in $(seq 1 30); do vm true 2>/dev/null && break; sleep 5; done
fi

# --- ship each build's app files: ~/farm/variants/<id> --------------------------------------------------------------
# id = git tree of the shipped dirs (+ a hash of uncommitted edits), so the same build is shipped once.
ship() { # $1 = ref or worktree -> prints the VM path
  local spec=$1 dir rev tree id
  if [ -d "${spec/#\~/$HOME}/www" ]; then
    dir=$(cd "${spec/#\~/$HOME}" && pwd)
    rev=$(git -C "$dir" rev-parse HEAD)
    tree=$(git -C "$dir" rev-parse HEAD:www | cut -c1-10)
    local dirty; dirty=$(git -C "$dir" status --porcelain -- www test/voice-follow package.json ':(exclude)www/assets/videos' | wc -l | tr -d ' ')
    if [ "$dirty" != 0 ]; then
      tree="${tree}-d$( (git -C "$dir" diff HEAD -- www test/voice-follow package.json; git -C "$dir" ls-files -o --exclude-standard -- www test/voice-follow | xargs -I{} cat "$dir/{}") | shasum | cut -c1-8)"
    fi
    id="$(basename "$dir")-${rev:0:8}-$tree"
    if ! vm "test -f ~/farm/variants/$id/.shipped" 2>/dev/null; then
      (cd "$dir" && COPYFILE_DISABLE=1 tar --no-xattrs --exclude www/assets/videos -czf - www test/voice-follow package.json) |
        vm "rm -rf ~/farm/variants/$id && mkdir -p ~/farm/variants/$id && cd ~/farm/variants/$id && tar xzf - && ln -s ~/personal/sttm-replay/node_modules node_modules && git init -q && git -c user.email=farm@vm -c user.name=farm add -A && GIT_AUTHOR_DATE=2026-01-01T00:00:00Z GIT_COMMITTER_DATE=2026-01-01T00:00:00Z git -c user.email=farm@vm -c user.name=farm commit -qm farm-variant && echo '$spec @ $rev (worktree, uncommitted edits: $dirty files)' > .shipped" >&2
    fi
  else
    rev=$(git -C "$REPO" rev-parse --verify "$spec^{commit}")
    id="${rev:0:12}"
    # a published build already on the VM as a real git worktree (the handover's 10 builds): use it as is
    if vm "test -d ~/personal/live-darbar-venues/cache/worktrees/$id/www" 2>/dev/null; then echo "/home/asingh02/personal/live-darbar-venues/cache/worktrees/$id"; return; fi
    if ! vm "test -f ~/farm/variants/$id/.shipped" 2>/dev/null; then
      git -C "$REPO" archive --format=tar "$rev" www test/voice-follow package.json | gzip |
        vm "rm -rf ~/farm/variants/$id && mkdir -p ~/farm/variants/$id && cd ~/farm/variants/$id && tar xzf - && rm -rf www/assets/videos && ln -s ~/personal/sttm-replay/node_modules node_modules && git init -q && git -c user.email=farm@vm -c user.name=farm add -A && GIT_AUTHOR_DATE=2026-01-01T00:00:00Z GIT_COMMITTER_DATE=2026-01-01T00:00:00Z git -c user.email=farm@vm -c user.name=farm commit -qm farm-variant && echo '$spec @ $rev' > .shipped" >&2
    fi
  fi
  echo "/home/asingh02/farm/variants/$id"
}

BASE_DIR=$(ship "$BASE")
RUN="$(date +%Y%m%d-%H%M%S)-$TAG"
names=(); dirs=()
for v in "${VARIANTS[@]}"; do
  d=$(ship "$v"); dirs+=("$d"); names+=("$(basename "$d")")
  echo "variant $v -> $d"
done

# --- compare all variants in parallel on the VM ---------------------------------------------------------------------
cat > /tmp/run-variant-$$.sh <<EOF
set -u
cd ~/personal/sttm-replay/research/level2-dataset/tools
export VF_EMIS_CACHE=\$HOME/farm/cache-x86 VF_AZURE_SAS=none VF_REPLAY_SLOTS=16 VF_BENCHMARK=\$HOME/personal/vf-benchmark
OUT=\$HOME/farm/runs/$RUN; mkdir -p \$OUT
fill=$FILL
if [ \$fill = 1 ] && pgrep -f '^node farm-build.js --workers' >/dev/null && ! pgrep -f '[f]arm-build.js.*--state' >/dev/null; then echo "--fill refused: the farm build is running (one writer per clip)"; fill=0; fi
cmp() { # \$1 dir \$2 name
  local o=\$OUT/\$2
  nice -n 5 node gab.js compare $BASE_DIR \$1 --tier full --set $SET --split $SPLIT ${IDS:+--ids $IDS} --name-a base --name "\$2" --out \$o > \$o.log 2>&1
  local code=\$?
  if [ \$code = 3 ] && [ \$fill = 1 ]; then
    ids=\$(node -e 'const c=require(process.argv[1]); console.log([...new Set((c.incomplete||[]).map(m=>m.key.split("/").pop()))].join(","))' \$o/compare.json)
    echo "filling \$ids for \$2" >> \$o.log
    for side in $BASE_DIR \$1; do node \$HOME/farm/farm-build.js --app \$side --stages base --only "\$ids" --workers 4 --state \$HOME/farm/fill-state/\$(basename \$side) --tap \$HOME/farm/fill-tap --out \$HOME/farm/fill-out >> \$o.log 2>&1; done
    mv \$o \$o.before-fill
    nice -n 5 node gab.js compare $BASE_DIR \$1 --tier full --set $SET --split $SPLIT ${IDS:+--ids $IDS} --name-a base --name "\$2" --out \$o >> \$o.log 2>&1
    code=\$?; echo "filled: \$ids" > \$o/FILLED
  fi
  echo \$code > \$o/EXIT
}
EOF
i=0; for d in "${dirs[@]}"; do echo "cmp $d ${names[$i]} &" >> /tmp/run-variant-$$.sh; i=$((i+1)); done
echo "wait" >> /tmp/run-variant-$$.sh
t0=$(date +%s)
vm "mkdir -p ~/farm/runs && cat > ~/farm/runs/$RUN.sh" < /tmp/run-variant-$$.sh
rm -f /tmp/run-variant-$$.sh
echo "running $RUN on the VM: ${#dirs[@]} variant(s), set $SET, split $SPLIT, base $BASE ..."
vm "bash ~/farm/runs/$RUN.sh"
wall=$(( $(date +%s) - t0 ))

# --- pull scorecards back -----------------------------------------------------------------------------------------
mkdir -p "$FARM_LOCAL/results/$RUN"
vm "cd ~/farm/runs/$RUN && tar czf - --exclude replay --exclude '*.before-fill/replay' ." | (cd "$FARM_LOCAL/results/$RUN" && tar xzf -)
worst=0
echo; echo "| variant | verdict | misses | filled | report |"; echo "|---|---|---|---|---|"
for n in "${names[@]}"; do
  d="$FARM_LOCAL/results/$RUN/$n"; code=$(cat "$d/EXIT" 2>/dev/null || echo 9)
  case $code in 0) v=PASS;; 1) v=FAIL;; 3) v=INCOMPLETE;; *) v="ERROR ($code)";; esac
  miss=$(node -e 'try{const c=require(process.argv[1]);console.log((c.incomplete||[]).length)}catch(e){console.log("?")}' "$d/compare.json")
  filled=$( [ -f "$d/FILLED" ] && sed 's/filled: //' "$d/FILLED" | tr ',' '\n' | grep -c . || echo 0)
  echo "| $n | $v | $miss | $filled | $d/compare.md |"
  [ "$code" = 3 ] && worst=3; [ "$code" = 1 ] && [ $worst = 0 ] && worst=1; [ "$code" -gt 3 ] && worst=3
done
echo; echo "wall ${wall} s for ${#names[@]} variant(s) (set $SET, split $SPLIT). Results: $FARM_LOCAL/results/$RUN"
exit $worst
