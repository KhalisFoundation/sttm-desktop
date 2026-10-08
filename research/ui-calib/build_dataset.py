#!/usr/bin/env python3
"""Calibration data for the Voice-Follow panel percentages, from benchmark traces with known truth.

Following phase (kirtan, Level 2 clips, Cycle 8 engine == 8.6c judge):
  one row per judge decode while a shabad is shown:
    cur_sc   mean current-shabad score over the last ~2.5 s of decodes
    margin   mean (current score - best challenger score) over the same window
    hyp      heard-fragment length this decode
    cur_ok   1 if the shown shabad is the sung one (truth, a listed also-correct, or a same-text copy)
  one row per challenger per decode:
    c_sc, c_margin (challenger - current), c_ok (challenger is the sung shabad)
Searching phase (lock-gate decodes): lead, best, count, ok (candidate is the sung shabad).
Only seconds inside the verified truth window are used (t >= 0)."""
import json, glob, os, sys
L2 = '/Users/asingh02/personal/sttm-bani/research/level2-dataset'
notes = json.load(open(f'{L2}/clip-notes.json'))
COPIES = {(4997, 2129), (2129, 4997), (51, 2533), (2533, 51)}
def same(a, b):
    return a == b or (a, b) in COPIES

follow, chall, search = [], [], []
decodes = []  # per judge decode: {g, t, cur, sCur, cands, truth}
def ingest(file, clipkey, truth_set, t_end, group):
    d = json.load(open(file)); ev = sorted(d['events'], key=lambda e: e['t'])
    cur = None; win = []  # (t, sCur, maxCand)
    by_t = {}
    for e in ev:
        if e['type'] == 'shabad' and not str(e.get('shabadId', '')).startswith('bani:'):
            cur = e['shabadId']
        if e['type'] != 'switch-comparison':
            continue
        t = e['t']
        ok = lambda s: any(same(s, x) for x in truth_set)
        if e.get('lockGate'):
            if 0 <= t <= t_end:
                search.append({'g': group, 'lead': e['lead'], 'best': e['best'], 'count': e['count'], 'ok': int(ok(e['cand']))})
        if e.get('judge') and cur is not None:
            k = round(t, 2)
            r = by_t.setdefault(k, {'t': t, 'cur': cur, 'sCur': e['sCur'], 'hyp': e.get('hypLen', 0), 'cands': {}})
            r['cands'][e['cand']] = max(r['cands'].get(e['cand'], 0), e['sCand'])
    rows = sorted(by_t.values(), key=lambda r: r['t'])
    for r in rows:
        if 0 <= r['t'] <= t_end:
            decodes.append({'g': group, 't': r['t'], 'cur': r['cur'], 'sCur': r['sCur'], 'cands': {str(k): v for k, v in r['cands'].items()}, 'truth': sorted(truth_set)})
    for i, r in enumerate(rows):
        if not (0 <= r['t'] <= t_end):
            continue
        w = [x for x in rows[max(0, i - 10):i + 1] if r['t'] - x['t'] <= 2.5 and x['cur'] == r['cur']]
        ok = lambda s: any(same(s, x) for x in truth_set)
        mc = lambda x: max(x['cands'].values()) if x['cands'] else 0.0
        cur_sc = sum(x['sCur'] for x in w) / len(w)
        margin = sum(x['sCur'] - mc(x) for x in w) / len(w)
        follow.append({'g': group, 'cur_sc': cur_sc, 'margin': margin, 'hyp': r['hyp'], 'n': len(w), 'cur_ok': int(ok(r['cur']))})
        for cid, sc in r['cands'].items():
            hist = [x['cands'][cid] for x in w if cid in x['cands']]
            c_sc = sum(hist) / len(hist)
            c_margin = sum(x['cands'][cid] - x['sCur'] for x in w if cid in x['cands']) / len(hist)
            chall.append({'g': group, 'c_sc': c_sc, 'c_margin': c_margin, 'seen': len(hist), 'c_ok': int(ok(cid) and not ok(r['cur']))})

for f in sorted(glob.glob(f'{L2}/results/c8ctl-fast-l2t/clip*/clip*.json')):
    clip = os.path.basename(f)[:-5]; d = json.load(open(f)); row = d['row']; n = notes.get(clip, {})
    truth = {n.get('truth_override') or row['shabad_ids'][0], *n.get('also_correct', [])}
    t_end = (n.get('end_override_s') or row['end_s']) - row['start_s']
    ingest(f, clip, truth, t_end, clip)
# Renton Aarti medleys with piece-level truth (recording seconds -> shabad being sung): r1 Wed, r6 Fri.
AA = '/Users/asingh02/personal/sttm-87-aarti/research/level2-dataset/aarti'
RD = '/Users/asingh02/personal/live-darbar-renton-dataset/manifests'
pieces = {
    'r1aarti': [(s['start'], s['end'], int(s['shabadId'])) for s in json.load(open(f'{RD}/manifest-r1a.json'))['segments']] + [(375, 450, 4967)],
    'r6aarti': [(s['start'], s['end'], int(s['shabadId'])) for s in json.load(open(f'{RD}/manifest-r6.json'))['segments']],
}
TOL = 6
def ingest_pieces(file):
    d = json.load(open(file)); row = d['row']; src = row.get('src') or row.get('video_id')
    if src not in pieces: return
    segs = pieces[src]; off = row['start_s']; t_end = row['end_s'] - off
    def sung(t):  # shabads acceptable at recording time off+t (within TOL of a boundary)
        T = off + t
        return {sid for a, b, sid in segs if a - TOL <= T < b + TOL}
    ev = sorted(d['events'], key=lambda e: e['t']); cur = None; by_t = {}
    for e in ev:
        if e['type'] == 'shabad':
            sid = e.get('shabadId'); cur = None if str(sid).startswith('bani:') else sid
        if e['type'] != 'switch-comparison': continue
        t = e['t']; truth = sung(t)
        if not truth or t < -30 or t > t_end: continue
        if e.get('lockGate'):
            search.append({'g': f'{src}@{off}', 'lead': e['lead'], 'best': e['best'], 'count': e['count'], 'ok': int(e['cand'] in truth)})
        if e.get('judge') and cur is not None:
            r = by_t.setdefault(round(t, 2), {'t': t, 'cur': cur, 'sCur': e['sCur'], 'hyp': e.get('hypLen', 0), 'cands': {}, 'truth': truth})
            r['cands'][e['cand']] = max(r['cands'].get(e['cand'], 0), e['sCand'])
    rows = sorted(by_t.values(), key=lambda r: r['t'])
    for r in rows:
        decodes.append({'g': f'{src}@{off}', 't': r['t'], 'cur': r['cur'], 'sCur': r['sCur'], 'cands': {str(k): v for k, v in r['cands'].items()}, 'truth': sorted(r['truth'])})
    for i, r in enumerate(rows):
        w = [x for x in rows[max(0, i - 10):i + 1] if r['t'] - x['t'] <= 2.5 and x['cur'] == r['cur']]
        mc = lambda x: max(x['cands'].values()) if x['cands'] else 0.0
        follow.append({'g': f'{src}@{off}', 'cur_sc': sum(x['sCur'] for x in w) / len(w), 'margin': sum(x['sCur'] - mc(x) for x in w) / len(w), 'hyp': r['hyp'], 'n': len(w), 'cur_ok': int(r['cur'] in r['truth'])})
        for cid in r['cands']:
            hist = [x['cands'][cid] for x in w if cid in x['cands']]
            chall.append({'g': f'{src}@{off}', 'c_sc': sum(hist) / len(hist), 'c_margin': sum(x['cands'][cid] - x['sCur'] for x in w if cid in x['cands']) / len(hist), 'seen': len(hist), 'c_ok': int(cid in r['truth'] and r['cur'] not in r['truth'])})
for f in sorted(glob.glob(f'{AA}/results-86b/aa*.json')):
    ingest_pieces(f)
# Hall test (Sep 25) and Renton prod (Sep 27): whole recordings run on the 8.6c code, truth per row
# from the user's verified sheet tabs (see research/level2-dataset/ab-81-86c).
AB = '/Users/asingh02/personal/sttm-desktop/research/level2-dataset/ab-81-86c'
tsec = json.load(open(f'{AB}/truth-seconds.json'))
for key, clip in (('hall', 'ab01'), ('rprod', 'ab02')):
    segs = [(r['start'], r['end'], r['shabad']) for r in tsec[key]]
    pieces[key] = segs
    f = f'{AB}/results-86c/{clip}.json'
    d = json.load(open(f)); d['row']['src'] = key; d['row']['start_s'] = 0; d['row']['end_s'] = max(b for a, b, s_ in segs)
    tmp = f'/tmp/ui-calib-{key}.json'; json.dump(d, open(tmp, 'w')); ingest_pieces(tmp)
out = os.path.dirname(os.path.abspath(__file__))
json.dump({'follow': follow, 'chall': chall, 'search': search, 'decodes': decodes}, open(f'{out}/dataset.json', 'w'))
print('follow rows', len(follow), 'cur_ok rate', round(sum(r['cur_ok'] for r in follow) / len(follow), 3))
print('challenger rows', len(chall), 'c_ok', sum(r['c_ok'] for r in chall))
print('search rows', len(search), 'ok rate', round(sum(r['ok'] for r in search) / max(1, len(search)), 3))
