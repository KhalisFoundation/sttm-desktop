#!/usr/bin/env python3
"""Fit the panel's live percentages as a posterior over the Shabads in contention.

Each judge decode gives a match score (0-1) for the current Shabad and for each challenger.
Evidence per Shabad: E <- lam * E + beta * score (a decayed running sum over the last few
decodes); an 'unknown Shabad' option gets beta * other per decode. The shown % for a Shabad
is softmax(E) over {current, challengers, unknown}. beta, lam, other are fitted (min log-loss
of the Shabad actually being sung), then checked with a reliability table: of all the moments
a card showed p%, how often was that card the Shabad being sung."""
import json, math, os, itertools, numpy as np
H = os.path.dirname(os.path.abspath(__file__))
dec = json.load(open(f'{H}/dataset.json'))['decodes']
groups = {}
for x in dec: groups.setdefault(x['g'], []).append(x)
for g in groups.values(): g.sort(key=lambda x: x['t'])

def run(beta, lam, other, collect=False):
    loss = 0.0; n = 0; pts = []
    for rows in groups.values():
        E = {}; last_t = None
        for r in rows:
            gap = 1 if last_t is None else max(1, round((r['t'] - last_t) / 0.51))
            last_t = r['t']
            dec_ = lam ** gap
            for k in list(E): E[k] *= dec_
            scores = {str(r['cur']): r['sCur'], **r['cands']}
            for k, s in scores.items(): E[k] = E.get(k, 0.0) + beta * s
            keys = list(scores)  # shown: current + challengers present now
            z = [E[k] for k in keys] + [beta * other / (1 - lam)]
            m = max(z); ex = [math.exp(v - m) for v in z]; S = sum(ex)
            p = {k: ex[i] / S for i, k in enumerate(keys)}; p_other = ex[-1] / S
            truth = {str(t) for t in r['truth']}
            right = [k for k in keys if k in truth]
            pr = sum(p[k] for k in right) if right else p_other
            loss -= math.log(max(pr, 1e-6)); n += 1
            if collect:
                for k in keys: pts.append((p[k], int(k in truth), k == str(r['cur'])))
    return loss / n, pts

best = None
for beta, lam, other in itertools.product([1, 2, 3, 4, 6, 8, 12], [0.5, 0.65, 0.75, 0.85, 0.9], [0.2, 0.3, 0.4, 0.5, 0.6]):
    l, _ = run(beta, lam, other)
    if best is None or l < best[0]: best = (l, beta, lam, other)
l, beta, lam, other = best
print(f'best log-loss {l:.4f} at beta={beta} lam={lam} other={other}')
_, pts = run(beta, lam, other, collect=True)
P = np.array([p for p, y, c in pts]); Y = np.array([y for p, y, c in pts]); C = np.array([c for p, y, c in pts])
for name, m0 in (('current card', C), ('challenger cards', ~C)):
    print(f'\n{name}: {m0.sum()} shown values; reliability (shown % -> actually the sung Shabad):')
    for lo, hi in ((0, .1), (.1, .3), (.3, .5), (.5, .7), (.7, .9), (.9, .97), (.97, .995), (.995, 1.01)):
        m = m0 & (P >= lo) & (P < hi)
        if m.sum(): print(f'   {lo*100:5.1f}-{min(hi,1)*100:5.1f}%: n {m.sum():6d}  mean shown {P[m].mean()*100:5.1f}%  actually right {Y[m].mean()*100:5.1f}%')
json.dump({'beta': beta, 'lam': lam, 'other': other, 'logloss': round(l, 4)}, open(f'{H}/posterior.json', 'w'), indent=1)
