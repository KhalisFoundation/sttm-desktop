#!/usr/bin/env python3
"""Posterior percentages with an incumbency term, then per-role Platt calibration, checked on
held-out recordings (5-fold, folds by recording). Output posterior.json for VoiceFollow.jsx."""
import json, math, os, itertools, numpy as np
H = os.path.dirname(os.path.abspath(__file__))
dec = json.load(open(f'{H}/dataset.json'))['decodes']
groups = {}
for x in dec: groups.setdefault(x['g'], []).append(x)
for g in groups.values(): g.sort(key=lambda x: x['t'])
G = sorted(groups)

def posts(gs, beta, lam, other, inc):
    out = []  # (logit_raw, is_current, right, group)
    for gname in gs:
        E = {}; last_t = None
        for r in groups[gname]:
            gap = 1 if last_t is None else max(1, round((r['t'] - last_t) / 0.51)); last_t = r['t']
            for k in list(E): E[k] *= lam ** gap
            cur = str(r['cur']); scores = {cur: r['sCur'], **r['cands']}
            for k, s in scores.items(): E[k] = E.get(k, 0.0) + beta * s
            keys = list(scores)
            z = [E[k] + (inc if k == cur else 0.0) for k in keys] + [beta * other / (1 - lam)]
            m = max(z); ex = [math.exp(v - m) for v in z]; S = sum(ex)
            truth = {str(t) for t in r['truth']}
            for i, k in enumerate(keys):
                p = min(max(ex[i] / S, 1e-6), 1 - 1e-6)
                out.append((math.log(p / (1 - p)), k == cur, int(k in truth), gname))
    return out

def platt(L, Y, it=3000, lr=0.05):
    a, b = 1.0, 0.0
    for _ in range(it):
        p = 1 / (1 + np.exp(-(a * L + b))); g = p - Y
        a -= lr * (g * L).mean(); b -= lr * g.mean()
    return a, b

def total_loss(rows, cal):
    l = 0.0
    for lg, c, y, g in rows:
        a, b = cal['cur' if c else 'ch']; p = 1 / (1 + math.exp(-(a * lg + b))); p = min(max(p, 1e-6), 1 - 1e-6)
        l -= math.log(p) if y else math.log(1 - p)
    return l / len(rows)

def fit_all(gs, grid):
    best = None
    for beta, lam, other, inc in grid:
        rows = posts(gs, beta, lam, other, inc)
        cal = {}
        for role in ('cur', 'ch'):
            sel = [(lg, y) for lg, c, y, g in rows if c == (role == 'cur')]
            L = np.array([s[0] for s in sel]); Y = np.array([s[1] for s in sel], float)
            cal[role] = platt(L, Y)
        l = total_loss(rows, cal)
        if best is None or l < best[0]: best = (l, (beta, lam, other, inc), cal)
    return best

grid = list(itertools.product([4, 8, 12], [0.65, 0.8, 0.9], [0.2, 0.4], [0, 2, 4, 6]))
# held-out check: fit on 4/5 of recordings, score the other 1/5
held = []
for k in range(5):
    te = [g for i, g in enumerate(G) if i % 5 == k]; tr = [g for g in G if g not in te]
    _, params, cal = fit_all(tr, grid)
    for lg, c, y, g in posts(te, *params):
        a, b = cal['cur' if c else 'ch']; held.append((1 / (1 + math.exp(-(a * lg + b))), c, y))
P = np.array([h[0] for h in held]); C = np.array([h[1] for h in held]); Y = np.array([h[2] for h in held])
for name, m0 in (('current card', C), ('challenger cards', ~C)):
    print(f'\nHELD-OUT {name}: {m0.sum()} shown values')
    for lo, hi in ((0, .1), (.1, .3), (.3, .5), (.5, .7), (.7, .9), (.9, .97), (.97, .995), (.995, 1.01)):
        m = m0 & (P >= lo) & (P < hi)
        if m.sum(): print(f'   {lo*100:5.1f}-{min(hi,1)*100:5.1f}%: n {m.sum():6d}  mean shown {P[m].mean()*100:5.1f}%  actually right {Y[m].mean()*100:5.1f}%')
l, params, cal = fit_all(G, grid)
beta, lam, other, inc = params
json.dump({'beta': beta, 'lam': lam, 'other': other, 'inc': inc, 'platt': {k: [round(v[0], 4), round(v[1], 4)] for k, v in cal.items()}, 'logloss': round(l, 4)}, open(f'{H}/posterior.json', 'w'), indent=1)
print('\nfinal params', params, 'platt', cal, 'loss', round(l, 4))
