#!/bin/bash
# run a command on the farm VM: vm.sh '<command>'
exec ~/google-cloud-sdk/bin/gcloud compute ssh vf-record --zone us-east1-b --project vf-bench-sttm --command "$1" 2>&1 | grep -v -e '^Warning: Permanently' -e 'Updating project ssh' -e 'Updating instance ssh' -e 'Waiting for SSH' -e '^\.*$'
