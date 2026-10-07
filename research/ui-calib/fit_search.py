#!/usr/bin/env python3
"""Search-phase percentage: leader shown as best / (best + second + K) (second from the lead).
Fit K so the shown value matches how often the leader is the sung Shabad; held-out check."""
import json, math, os, numpy as np
H = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(f'{H}/dataset.json'))['search']
def shown(r, K):
    best = r['best']; lead = max(r['lead'], 1e-6); second = best * (1 - lead) / lead
    return best / (best + second + K)
def loss(rs, K):
    l = 0
    for r in rs:
        p = min(max(shown(r, K), 1e-6), 1 - 1e-6); l -= math.log(p) if r['ok'] else math.log(1 - p)
    return l / len(rs)
Ks = [2, 4, 8, 16, 32, 64, 128, 256]
G = sorted({r['g'] for r in rows}); held = []
for k in range(5):
    te = {g for i, g in enumerate(G) if i % 5 == k}
    tr = [r for r in rows if r['g'] not in te]; K = min(Ks, key=lambda K: loss(tr, K))
    held += [(shown(r, K), r['ok']) for r in rows if r['g'] in te]
P = np.array([h[0] for h in held]); Y = np.array([h[1] for h in held])
for lo, hi in ((0, .1), (.1, .3), (.3, .5), (.5, .7), (.7, 1.01)):
    m = (P >= lo) & (P < hi)
    if m.sum(): print(f'  {lo*100:4.0f}-{min(hi,1)*100:4.0f}%: n {m.sum():4d} shown {P[m].mean()*100:5.1f}% right {Y[m].mean()*100:5.1f}%')
K = min(Ks, key=lambda K: loss(rows, K)); print('K =', K)
d = json.load(open(f'{H}/posterior.json')); d['searchK'] = K; json.dump(d, open(f'{H}/posterior.json', 'w'), indent=1)
