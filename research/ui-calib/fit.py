#!/usr/bin/env python3
"""Fit and check the panel's calibrated percentages (logistic models, leave-groups-out CV).
Writes calib.json: { follow: {w, b, feats}, chall: {...}, search: {...} } for VoiceFollow.jsx."""
import json, math, numpy as np, os
H = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(f'{H}/dataset.json'))
SPEC = {
    'follow': (['margin', 'cur_sc'], 'cur_ok', lambda r: [r['margin'], r['cur_sc']]),
    'chall': (['c_margin', 'c_sc', 'seen'], 'c_ok', lambda r: [r['c_margin'], r['c_sc'], min(r['seen'], 5) / 5]),
    'search': (['lead', 'log_best', 'count'], 'ok', lambda r: [r['lead'], math.log1p(r['best']), min(r['count'], 6) / 6]),
}
def fit(X, y, l2=0.05, it=4000, lr=0.3):
    w = np.zeros(X.shape[1]); b = math.log((y.mean() + 1e-3) / (1 - y.mean() + 1e-3))
    for _ in range(it):
        p = 1 / (1 + np.exp(-(X @ w + b)))
        g = p - y
        w -= lr * (X.T @ g / len(y) + l2 * w); b -= lr * g.mean()
    return w, b
out = {}
for name, (feats, lab, fx) in SPEC.items():
    rows = d[name]; X = np.array([fx(r) for r in rows], float); y = np.array([r[lab] for r in rows], float)
    groups = sorted({r['g'] for r in rows}); gi = np.array([groups.index(r['g']) for r in rows])
    # 5-fold leave-groups-out predictions for an honest reliability table
    pred = np.zeros(len(y)); folds = np.arange(len(groups)) % 5
    for k in range(5):
        te = np.isin(gi, np.where(folds == k)[0]); tr = ~te
        if tr.sum() == 0 or te.sum() == 0 or y[tr].min() == y[tr].max(): continue
        w, b = fit(X[tr], y[tr]); pred[te] = 1 / (1 + np.exp(-(X[te] @ w + b)))
    w, b = fit(X, y)
    out[name] = {'feats': feats, 'w': [round(float(v), 4) for v in w], 'b': round(float(b), 4)}
    print(f'\n## {name}: {len(y)} rows, base rate {y.mean():.3f}, weights {dict(zip(feats, out[name]["w"]))} bias {out[name]["b"]}')
    print('   held-out reliability (predicted bin -> actual):')
    for lo, hi in ((0, .05), (.05, .2), (.2, .5), (.5, .8), (.8, .95), (.95, .99), (.99, 1.01)):
        m = (pred >= lo) & (pred < hi)
        if m.sum(): print(f'     {lo:4.2f}-{min(hi,1):4.2f}: n {m.sum():5d}  predicted {pred[m].mean():.3f}  actual {y[m].mean():.3f}')
json.dump(out, open(f'{H}/calib.json', 'w'), indent=1)
