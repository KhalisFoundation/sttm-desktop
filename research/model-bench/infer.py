#!/usr/bin/env python3
"""infer.py - per-window transcripts of one speech model over the benchmark clips (see README.md).

Every model hears the SAME windows: for each clip of sample.json, windows [t - W, t] for t = start + W, start + W + 1,
... <= end (W = --win seconds, 1 s hop), 16 kHz mono float32, one window at a time (batch 1, so per-utterance feature
normalisation never sees padding). Greedy CTC decode (argmax, collapse repeats, drop blank), SentencePiece decode -
the model cards' own script. Output: <out>/<name>/<clip>.jsonl, one {"t": window end (clip s), "text": ...} per window,
plus meta.json (model sha256, window, versions).

  python infer.py --model karanbir --win 10 --data data --out transcripts
  python infer.py --model jaspal-v2 --win 4 ...
  python infer.py --onnx my.onnx --spm my.model --blank 0 --name my-model --win 10 ...   (any audio -> log_probs ONNX)
"""
import argparse, hashlib, json, os, platform, sys, time, wave

import numpy as np
import onnxruntime as ort
import sentencepiece as spm

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 16000

# name -> (HF repo, ONNX file, tokenizer file, blank id, front-end ONNX or None). Files are fetched by fetch.py into
# <data>/models/<name>/ and checked against SHA256 below, so every run uses byte-identical models.
MODELS = {
    'karanbir': ('karansea/indicconformer-stt-pa-ctc-shabad-preview', 'model.int8.onnx', 'tokenizer.model', 256, None),
    'jaspal-v0': ('jssaluja/sggs-asr-v0-onnx', 'sggs-asr-v0.int8.onnx', 'bpe.model', 0, None),
    'jaspal-v1': ('jssaluja/sggs-asr-v1-onnx', 'sggs-large-epoch90.int8.onnx', 'bpe.model', 0, None),
    # The published v2 ONNX takes 80-dim features (x [N,T,80], x_lens), not audio. Its front-end is v1's in-graph
    # fbank + per-utterance normalisation, cut out of the v1 file by make_v2_frontend.py (outputs /Div_output_0,
    # /Where_output_0). Un-normalised features give much shorter, less accurate text; with this front-end v2 matches v1's
    # style. PROVISIONAL: the model card describes an audio-input graph, so the author should confirm the file and front-end.
    'jaspal-v2': ('jssaluja/sggs-asr-v2-onnx', 'sggs-asr-v2.int8.onnx', 'bpe.model', 0, 'frontend-from-v1.onnx'),
}
# v0 has no tokenizer in its ONNX repo: the author's matching bpe.model lives in jssaluja/sggs-asr-v0.
TOKENIZER_REPO = {'jaspal-v0': 'jssaluja/sggs-asr-v0'}
SHA256 = {
    'karanbir/model.int8.onnx': '5f9e41d867dee2883796e290eef85abc11cbd32fe0f10c1f763a638d824634f9',
    'jaspal-v0/sggs-asr-v0.int8.onnx': 'bf13d5afe96823d21e7816455942cf35030213d9b0c675de62046cd2d59d7892',
    'jaspal-v1/sggs-large-epoch90.int8.onnx': 'ed4947180bd9fdb651771c0471bda7d66ce2934f1668b5116c3df2c2f3e2414e',
    'jaspal-v1/bpe.model': '0b959e7682fd0d9685126ca65910697be0d32c40048cddcf3e03e8a2d6ca9374',
    'jaspal-v2/sggs-asr-v2.int8.onnx': '05f102fa8c6ae3498c5dc9296e6cdc01599dbb67890f429142ad3740644f3816',
    'jaspal-v2/bpe.model': '4badd76f267c95c08510c0a4ce15e2d33a4abb4c53bdcf85a07b247768168c9e',
    'jaspal-v0/bpe.model': '8223a4bfad0d02488de835dcdbcf0934ee1aff17c20a55b662b0d8657ab4e8c2',
    'karanbir/tokenizer.model': '63a2e8f1221ba60a7b315a14c8da49ff4873d6b5e46e9145dc4f7a4fe4742834',
    'jaspal-v2/frontend-from-v1.onnx': '66f9b763f3c7e84945d63f76ccc5f1d832a82cfae262c59afd7d171c9754fdea',
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def read_wav(path):
    with wave.open(path, 'rb') as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2, f'{path}: need 16 kHz mono s16'
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return pcm.astype(np.float32) / 32768.0


def windows(pcm, start, end, win, hop=1.0):
    t = start + win
    while t <= end + 1e-6:
        a, b = int(round((t - win) * SR)), int(round(t * SR))
        if b > len(pcm):
            break
        yield round(t, 3), np.ascontiguousarray(pcm[a:b])
        t += hop


class Model:
    def __init__(self, onnx_path, spm_path, blank, frontend=None, threads=4):
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(onnx_path, o, providers=['CPUExecutionProvider'])
        self.fe = ort.InferenceSession(frontend, o, providers=['CPUExecutionProvider']) if frontend else None
        self.sp = spm.SentencePieceProcessor(model_file=spm_path)
        self.blank = blank

    def log_probs(self, w):
        feed = {'audio': w[None, :], 'audio_len': np.array([len(w)], dtype=np.int64)}
        if self.fe:
            f, fl = self.fe.run(['/Div_output_0', '/Where_output_0'], feed)
            lp, n = self.sess.run(None, {'x': f, 'x_lens': fl.astype(np.int64)})
        else:
            lp, n = self.sess.run(['log_probs', 'out_len'], feed)
        return lp[0, :int(n[0])]

    def transcribe(self, w):
        ids, prev, out = self.log_probs(w).argmax(-1).tolist(), -1, []
        for i in ids:
            if i != prev and i != self.blank:
                out.append(int(i))
            prev = i
        return self.sp.decode(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', choices=sorted(MODELS), help='a published model (fetched by fetch.py)')
    ap.add_argument('--onnx'); ap.add_argument('--spm'); ap.add_argument('--blank', type=int, default=0)
    ap.add_argument('--frontend', help='audio -> features ONNX for a features-input --onnx')
    ap.add_argument('--name', help='output folder name (default <model>-w<win>)')
    ap.add_argument('--win', type=float, default=10.0, help='window seconds (the app uses 10)')
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--data', default=os.path.join(HERE, 'data'))
    ap.add_argument('--out', default=os.path.join(HERE, 'transcripts'))
    ap.add_argument('--only', default='', help='comma-separated clip ids (smoke test)')
    a = ap.parse_args()
    if a.model:
        _, f, tok, blank, fe = MODELS[a.model]
        d = os.path.join(a.data, 'models', a.model)
        onnx_path, spm_path = os.path.join(d, f), os.path.join(d, tok)
        frontend = os.path.join(d, fe) if fe else None
        for p in filter(None, (onnx_path, spm_path, frontend)):
            want = SHA256.get(f'{a.model}/{os.path.basename(p)}')
            if want and sha256(p) != want:
                sys.exit(f'{p}: sha256 differs from the pinned one (re-run fetch.py)')
    else:
        onnx_path, spm_path, blank, frontend = a.onnx, a.spm, a.blank, a.frontend
    name = a.name or f'{a.model or "model"}-w{a.win:g}'
    sample = json.load(open(os.path.join(HERE, 'sample.json')))
    only = set(filter(None, a.only.split(',')))
    m = Model(onnx_path, spm_path, blank, frontend, a.threads)
    od = os.path.join(a.out, name)
    os.makedirs(od, exist_ok=True)
    meta = {'model': a.model or onnx_path, 'onnx_sha256': sha256(onnx_path), 'tokenizer_sha256': sha256(spm_path),
            'frontend_sha256': sha256(frontend) if frontend else None, 'window_s': a.win, 'hop_s': 1.0, 'blank': blank,
            'threads': a.threads, 'onnxruntime': ort.__version__, 'numpy': np.__version__, 'machine': platform.machine(),
            'started': time.strftime('%Y-%m-%d %H:%M')}
    # Resume only finished clips from the SAME model files and window; anything else is redone.
    key = {k: meta[k] for k in ('onnx_sha256', 'tokenizer_sha256', 'frontend_sha256', 'window_s', 'blank')}
    mp = os.path.join(od, 'meta.json')
    prev = json.load(open(mp)).get('key') if os.path.exists(mp) else None
    meta['key'] = key
    json.dump(dict(meta, complete=False), open(mp, 'w'), indent=1)
    t0, nw = time.time(), 0
    for c in sample['clips']:
        if only and c['id'] not in only:
            continue
        f = os.path.join(od, f"{c['id']}.jsonl")
        if os.path.exists(f) and prev == key:
            continue
        pcm = read_wav(os.path.join(a.data, 'clips', c['id'], 'audio.wav'))
        rows = [{'t': t, 'text': m.transcribe(w)} for t, w in windows(pcm, c['start'], c['end'], a.win)]
        with open(f + '.tmp', 'w') as fh:
            fh.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
        os.replace(f + '.tmp', f)
        nw += len(rows)
        print(f"{name} {c['id']}: {len(rows)} windows ({time.time() - t0:.0f} s)", flush=True)
    meta.update(seconds=round(time.time() - t0), windows_this_run=nw, complete=not only)
    json.dump(meta, open(mp, 'w'), indent=1)


if __name__ == '__main__':
    main()
