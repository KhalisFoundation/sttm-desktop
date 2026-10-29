"""latency.py [threads] - per-window latency of each model, set up like the app (engine/infer.js): batch 1, intra-op
threads 4 (the app uses 2 on < 8 cores), inter-op 1, no spinning, CPU. Real audio windows of 4 s and 10 s (the app's
recognizer window) from one benchmark clip; 5 warm-up runs, then the median and 90th percentile of 40."""
import json, os, platform, statistics, sys, time, wave
import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from infer import MODELS as PUBLISHED  # noqa: E402
M = os.path.join(HERE, 'data', 'models')
MODELS = {n: f'{M}/{n}/{v[1]}' for n, v in PUBLISHED.items()}
FRONTEND = {n: f'{M}/{n}/{v[4]}' for n, v in PUBLISHED.items() if v[4]}
wav = os.path.join(HERE, 'data', 'clips', 'ytap_5N6Cgw8WAaY_1200-1800_x1.35', 'audio.wav')
threads = int(sys.argv[1]) if len(sys.argv) > 1 else 4
runs = 40
with wave.open(wav) as w:
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
out = {'machine': platform.processor() or platform.machine(), 'cores': os.cpu_count(), 'threads': threads, 'ort': ort.__version__, 'models': {}}
for name, path in MODELS.items():
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.add_session_config_entry('session.intra_op.allow_spinning', '0')
    t0 = time.perf_counter()
    sess = ort.InferenceSession(path, so, providers=['CPUExecutionProvider'])
    fe = ort.InferenceSession(FRONTEND[name], so, providers=['CPUExecutionProvider']) if name in FRONTEND else None
    load_ms = (time.perf_counter() - t0) * 1000
    r = {'load_ms': round(load_ms), 'size_mb': round(os.path.getsize(path) / 1e6)}
    for win in (4, 10):
        n = win * 16000
        lat = []
        for i in range(runs + 5):
            s0 = (i * 7919 * 16) % (len(pcm) - n)
            x = np.ascontiguousarray(pcm[s0:s0 + n])[None, :]
            t = time.perf_counter()
            if fe:
                f, fl = fe.run(None, {'audio': x, 'audio_len': np.array([n], dtype=np.int64)})
                sess.run(None, {'x': f, 'x_lens': fl.astype(np.int64)})
            else:
                sess.run(None, {'audio': x, 'audio_len': np.array([n], dtype=np.int64)})
            if i >= 5:
                lat.append((time.perf_counter() - t) * 1000)
        lat.sort()
        r[f'{win}s'] = {'median_ms': round(statistics.median(lat)), 'p90_ms': round(lat[int(len(lat) * .9)])}
    out['models'][name] = r
    print(name, r, flush=True)
print(json.dumps(out))
