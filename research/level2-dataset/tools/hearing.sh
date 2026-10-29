#!/bin/bash
# hearing.sh — the hearing-score diagnostic in one command (results/HEARING.md).
#   ./hearing.sh <model> [<model> ...]    transcribe the sample with each model (skips clips already done), then rescore all
#   ./hearing.sh score                    rescore only
#   ./hearing.sh app                      app-side traces for the akhand tier (production model, private store)
# <model>: karanbir-int8 | karanbir-fp32 | surinder-ctc | surinder-rnnt | sukhpal-ctc | sukhpal-rnnt | jaspal-int8
#          onnx:<path.onnx>   (Karanbir-style ONNX: audio, audio_len -> log_probs, out_len; HEARING_SPM=<tokenizer.model>)
#          nemo:<path.nemo>[:ctc|rnnt]   (AI4Bharat IndicConformer-style hybrid checkpoint; pa slice)
#          icefall:<dir>      (icefall Zipformer2 model.pt + bpe.model, e.g. ~/AAI/models/jaspal-sggs-v0; nemo-venv)
# Add --name <folder> after the model via HEARING_NAME=<folder> to name a generic model's results.
# Inference runs one model at a time at nice 19 under the shared bench lock (/tmp/vf-bench.lock).
set -euo pipefail
cd "$(dirname "$0")"
ONNX_PY=${ONNX_PY:-$HOME/AAI/voice-venv/bin/python}    # onnxruntime + sentencepiece + numpy
NEMO_PY=${NEMO_PY:-$HOME/AAI/nemo-venv/bin/python}     # nemo_toolkit[asr] (torch, sentencepiece)
LOCK=/tmp/vf-bench.lock
for m in "$@"; do
  case "$m" in
    score) ;;
    app) VF_DRIVER_ROOT=${VF_DRIVER_ROOT:-$HOME/personal/live-darbar-venues/cache/worktrees/3fafc0baf8a7} \
           lockf -k "$LOCK" nice -n 19 node hearing-app-replay.js --tier akhand ;;
    karanbir-*|jaspal-int8|onnx:*) lockf -k "$LOCK" nice -n 19 "$ONNX_PY" hearing-infer.py --model "$m" ${HEARING_NAME:+--name "$HEARING_NAME"} ;;
    *) lockf -k "$LOCK" nice -n 19 "$NEMO_PY" hearing-infer.py --model "$m" ${HEARING_NAME:+--name "$HEARING_NAME"} 2>&1 | grep -v -i "warning\|onelogger\|exporters\|super().__init__" ;;
  esac
done
node hearing-score.js
