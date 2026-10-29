#!/bin/bash
# Keeps the farm build going across the VM's 6 h self-stops: start the VM (same 6 h limit) and relaunch the
# resumable build when it is not running. Prints one line per action. Exits when the build log says all clips are done.
GC=~/google-cloud-sdk/bin/gcloud; V="vf-record --zone us-east1-b --project vf-bench-sttm"
ARGS=${FARM_ARGS:---workers 10 --classes A,C}
while true; do
  st=$($GC compute instances describe $V --format='value(status)' 2>/dev/null)
  if [ -f ~/personal/gcp-farm/PAUSE ]; then sleep 300; continue; fi  # touch PAUSE to keep a deliberately stopped VM stopped
  if [ "$st" = TERMINATED ] || [ "$st" = STOPPED ]; then
    echo "$(date '+%H:%M') VM $st -> starting"; $GC compute instances start $V >/dev/null 2>&1; sleep 60; continue
  fi
  if [ "$st" = RUNNING ]; then
    out=$(~/personal/gcp-farm/vm.sh "if pgrep -f '^node farm-build.js --workers' >/dev/null; then echo running; elif tail -1 ~/farm/build.log | grep -q 'end: 324 of 324'; then echo finished; elif [ \$(grep -c 'start: 324' ~/farm/build.log) -ge 8 ]; then echo giveup; else cd ~/farm && (setsid nohup node farm-build.js $ARGS >> build.out 2>&1 < /dev/null &) && echo relaunched; fi" 2>/dev/null | tail -1)
    case "$out" in
      finished) echo "$(date '+%H:%M') build finished"; exit 0;;
      giveup) echo "$(date '+%H:%M') build relaunched 8 times; some clips keep failing"; exit 1;;
      relaunched) echo "$(date '+%H:%M') build relaunched";;
    esac
  fi
  sleep 300
done
