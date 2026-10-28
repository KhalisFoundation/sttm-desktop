#!/usr/bin/env python3
"""make_v2_frontend.py <v1.onnx> <out.onnx> - cut v1's in-graph audio front-end out of jssaluja/sggs-asr-v1-onnx.

v1's graph = 16 kHz audio -> 80-bin log-mel fbank -> per-utterance mean/std normalisation (/Div_output_0) and frame
counts (/Where_output_0) -> Zipformer encoder -> CTC. The published v2 ONNX starts at the encoder (inputs x, x_lens),
so the benchmark feeds it this front-end. The cut keeps only the nodes between the graph inputs and those two tensors.
"""
import sys

import onnx
from onnx.utils import Extractor

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
sub = Extractor(m).extract_model(['audio', 'audio_len'], ['/Div_output_0', '/Where_output_0'])
onnx.save(sub, dst)
print(f'wrote {dst}: {len(sub.graph.node)} nodes, outputs {[o.name for o in sub.graph.output]}')
