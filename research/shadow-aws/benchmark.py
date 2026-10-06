#!/usr/bin/env python3
"""Official Voice-Follow benchmark from sangat shadow sessions.

    python3 benchmark.py            # sync raw/ from S3 (no audio), score, write derived/ index/ reports/
    python3 benchmark.py --local    # score what is already in ./raw
    python3 benchmark.py --publish  # also upload derived/ index/ reports/ back to S3

Layout (S3 and local mirror):
    raw/<gurdwara>/<tester name>/<date>/<session>/   session.json human.jsonl system.jsonl activity.jsonl
                                                      events.jsonl audio-*.webm   (older sessions: raw/<tester id>/<date>/...)
    derived/<session>/               score.json segments.jsonl listen.jsonl   (recomputable from raw)
    index/sessions.jsonl             one line per session: who, where, when, minutes per state, score
    reports/<date>.md                the benchmark table and the listen list

Each session is scored by www/main/addons/voice-follow/shadow/score.js, the same file the
tester's app runs live, so live and official numbers are one computation. Its header
documents the states (kirtan / held / idle / paused) and the human-timing rules
(lag, early, linger, blip, steady, lines, listen).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import review  # noqa: E402

BUCKET = 's3://vf-shadow-sessions-680476617406'
AWS = [os.path.expanduser('~/.local/bin/aws'), '--profile', 'gurbani-prod', '--region', 'us-east-2']
HERE = os.path.dirname(os.path.abspath(__file__))

SCORER = os.path.join(HERE, '..', '..', 'www', 'main', 'addons', 'voice-follow', 'shadow', 'score.js')
SUM_KEYS = ['kirtan', 'held', 'idle', 'paused', 'agree', 'early', 'wrong', 'behind', 'none',
            'heldAgree', 'heldBehind', 'heldWrong', 'heldNone', 'idleQuiet',
            'idleEarly', 'linger', 'falseAlarm', 'vfDown', 'switchesCut', 'lineChanges', 'lineFound',
            'modelSwitches', 'modelSwitchesRight', 'modelLineMoves', 'modelLineMovesRight', 'switchesCold', 'lineSeconds', 'lineAgree', 'switches', 'matched']


def score_session(d, fixes=None):
    """Score one raw session folder with the shared scorer (and human-checked fixes)."""
    args = [shutil.which('node') or 'node', SCORER, d]
    if fixes:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(fixes, f)
        args.append(f.name)
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True)
    finally:
        if fixes:
            os.unlink(f.name)
    return json.loads(out.stdout)


def score_session_timelines(timelines):
    """Score in-memory timelines (tests): writes them to a temp folder and runs the scorer."""
    d = tempfile.mkdtemp(prefix='vfscore-')
    try:
        for name in ('human', 'system', 'activity', 'events'):
            with open(os.path.join(d, f'{name}.jsonl'), 'w') as f:
                f.writelines(json.dumps(r) + '\n' for r in timelines.get(name, []))
        return score_session(d)
    finally:
        shutil.rmtree(d)


def pct(a, b):
    return round(100 * a / b, 1) if b else None


def summarize(sc):
    """Same definitions as summarize() in score.js (see its header)."""
    right = sc['agree'] + sc['early']
    dl = sorted(sc['switchDelays'])
    return {
        'success_pct': pct(right, right + sc['wrong']),
        'line_success_pct': pct(sc['lineAgree'], sc['lineSeconds']),
        'found_pct': pct(sc['matched'], sc['switches']),
        'switches': sc['switches'],
        'median_delay_s': dl[len(dl) // 2] if dl else None,
        'worst_delay_s': dl[-1] if dl else None,
        'scored_min': round((right + sc['wrong']) / 60, 1),
        'catch_up_min': round((sc['behind'] + sc['none']) / 60, 1),
        'held_min': round(sc['held'] / 60, 1),
        'idle_min': round(sc['idle'] / 60, 1),
        'paused_min': round(sc['paused'] / 60, 1),
        'vf_down_min': round(sc.get('vfDown', 0) / 60, 1),
        'false_alarm_pct': pct(sc['falseAlarm'], sc['idle']),
    }


def add(a, b):
    for key in SUM_KEYS:
        a[key] = a.get(key, 0) + b[key]
    for key in ('switchDelays', 'lineDelays', 'coldDelays'):
        a[key] = sorted(a.get(key, []) + b.get(key, []))
    a['testerWrong'] = a.get('testerWrong', 0) + b.get('testerWrong', 0)
    return a


# ---- The scorecard: was the model about as good as a person? -----------------------------
# Every number is a score out of 100 where HIGHER IS BETTER, shown for the model and for the
# person (the tester). The answer for each question comes from the GAP (model minus person,
# in points: positive = model better), using the levels below. Change the edges here and
# every past session is rescored.
LEVELS = ['MUCH WORSE', 'WORSE', 'EQUIVALENT', 'BETTER', 'MUCH BETTER']
INF = float('inf')
# Edges on the gap: below e0 MUCH WORSE, below e1 WORSE, below e2 EQUIVALENT, below e3 BETTER.
ACCURACY_EDGES = [-3, -1, 1, 3]        # right-shabad accuracy, within 1 point = equivalent
SPEED_EDGES = [-25, -10, INF, INF]     # changes caught within 30 s; person = 100 by definition
LINE_EDGES = [-10, -5, INF, INF]       # right line; person = 100 by definition
LINE_SPEED_EDGES = [-25, -10, INF, INF]  # line changes caught within 5 s
CATCH_S = 30
LINE_CATCH_S = 5
MIN_SERVICES = 5               # fewer services than this: the answer is only a lean
RESAMPLES = 1000


def level(gap, edges):
    for i, e in enumerate(edges):
        if gap < e:
            return LEVELS[i]
    return LEVELS[4]


def worst(*levels):
    return min(levels, key=LEVELS.index)


def med(xs):
    """Median; the average of the middle two for an even count."""
    if not xs:
        return None
    xs = sorted(xs)
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else round((xs[m - 1] + xs[m]) / 2, 1)


def score(a, b):
    return None if not b else 100 * a / b


def kpis(sc):
    """Scores out of 100 (higher is better) from summed, reviewed counts."""
    right = sc['agree'] + sc['early']
    committed = right + sc['wrong']
    tw = sc.get('testerWrong', 0)
    sd = sc['switchDelays']
    return {
        'scored_h': round(committed / 3600, 2),
        # Accuracy: of the time a shabad was up, how much of it was the right one.
        'accuracy': score(right, committed),
        'tester_accuracy': score(committed - tw, committed),
        # Speed: of the tester's shabad changes, how many the model had within CATCH_S.
        'changes': sc['switches'],
        'caught_15': score(sum(d <= 15 for d in sd), sc['switches']),
        'caught_30': score(sum(d <= CATCH_S for d in sd), sc['switches']),
        'caught_60': score(sum(d <= 60 for d in sd), sc['switches']),
        'first': score(sum(d <= 0 for d in sd), sc['switches']),
        'median_delay_s': med(sd),
        'cold_starts': sc.get('switchesCold', 0),
        'median_cold_s': med(sc.get('coldDelays', [])),
        # Lines, when both are on the same shabad.
        'right_line': score(sc['lineAgree'], sc['lineSeconds']),
        'line_changes': sc['lineChanges'],
        'line_caught_5': score(sum(d <= LINE_CATCH_S for d in sc['lineDelays']), sc['lineChanges']),
        # Steadiness: of the changes the model made itself, how many were right.
        'switch_right': score(sc['modelSwitchesRight'], sc['modelSwitches']),
        'line_move_right': score(sc['modelLineMovesRight'], sc['modelLineMoves']),
        # Quiet: with nothing to show, how often the model also showed nothing.
        'quiet': score(sc['idle'] - sc['falseAlarm'], sc['idle']),
    }


def gaps(k):
    g = lambda m, p: None if m is None or p is None else m - p
    return {
        'accuracy': g(k['accuracy'], k['tester_accuracy']),
        'speed': g(k['caught_30'], 100.0 if k['caught_30'] is not None else None),
        'line': g(k['right_line'], 100.0 if k['right_line'] is not None else None),
        'line_speed': g(k['line_caught_5'], 100.0 if k['line_caught_5'] is not None else None),
    }


def verdict(values, fn):
    """(answer, low, high) from resampled values: an answer only when the whole 90% range
    gives the same level, else 'between A and B'."""
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return 'NO DATA', None, None
    lo, hi = vals[int(0.05 * (len(vals) - 1))], vals[int(0.95 * (len(vals) - 1))]
    a, b = fn(lo), fn(hi)
    return (a if a == b else f'between {a} and {b}'), lo, hi


def scorecard(per_session, changes=()):
    """per_session: [(name, gurdwara, reviewed counts)]. Returns markdown lines and the numbers."""
    import random
    total = {}
    for _, _, sc in per_session:
        add(total, sc)
    k = kpis(total)
    rng = random.Random(7)
    boot = []
    for _ in range(RESAMPLES if per_session else 0):
        t = {}
        for _ in per_session:
            add(t, rng.choice(per_session)[2])
        boot.append(gaps(kpis(t)))
    acc = verdict([b['accuracy'] for b in boot], lambda x: level(x, ACCURACY_EDGES))
    spd = verdict([b['speed'] for b in boot], lambda x: level(x, SPEED_EDGES))
    lin = verdict([None if b['line'] is None or b['line_speed'] is None else (b['line'], b['line_speed'])
                   for b in boot], lambda x: worst(level(x[0], LINE_EDGES), level(x[1], LINE_SPEED_EDGES)))
    services = len(per_session)
    lean = services < MIN_SERVICES
    show = lambda v: (f'{v[0]} (early lean: {services} of {MIN_SERVICES} services)' if lean and v[0] != 'NO DATA'
                      else v[0])
    num = lambda x: f'{x:.0f}' if abs(x - round(x)) < 0.05 else f'{x:.1f}'
    f = lambda x: 'n/a' if x is None else num(x) + '%'
    gap = lambda m, p: 'n/a' if m is None or p is None else ('+' if m >= p else '−') + num(abs(m - p)) + ' pts'
    when = lambda d: 'n/a' if d is None else 'at the same time as' if d == 0 else (
        f'{num(d)} s after' if d > 0 else f'{num(-d)} s before')
    lines = [
        '## Model vs. a person', '',
        f'{services} services · {len({n for n, _, _ in per_session})} testers · '
        f'{len({g for _, g, _ in per_session if g})} Gurdwaras · {k["scored_h"]} h of singing scored', '',
        'Every score is a percentage and **higher is better**. The gap is model minus person in '
        'percentage points: **positive means the model did better**.', '',
        '| Question | Answer | Model | Person | Gap |', '|---|---|---|---|---|',
        f'| **Accuracy**: when a shabad is up, is it the right one? | **{show(acc)}** | {f(k["accuracy"])} '
        f'| {f(k["tester_accuracy"])} | {gap(k["accuracy"], k["tester_accuracy"])} |',
        f'| **Speed**: of the shabad changes, how many the model had within {CATCH_S} s | **{show(spd)}** '
        f'| {f(k["caught_30"])} (typically {when(k["median_delay_s"])} the person) | 100% '
        f'| {gap(k["caught_30"], 100.0 if k["caught_30"] is not None else None)} |',
        f'| **Lines**: right line, when on the same shabad | **{show(lin)}** | {f(k["right_line"])} | 100% '
        f'| {gap(k["right_line"], 100.0 if k["right_line"] is not None else None)} |',
        f'| ↳ line changes caught within {LINE_CATCH_S} s | (part of Lines) | {f(k["line_caught_5"])} | 100% '
        f'| {gap(k["line_caught_5"], 100.0 if k["line_caught_5"] is not None else None)} |',
        f'| **Steadiness**: of the shabad changes the model made, how many were right | (watch) '
        f'| {f(k["switch_right"])} | 100% | {gap(k["switch_right"], 100.0 if k["switch_right"] is not None else None)} |',
        f'| ↳ of the line moves the model made, how many were right | (watch) | {f(k["line_move_right"])} | 100% '
        f'| {gap(k["line_move_right"], 100.0 if k["line_move_right"] is not None else None)} |',
        f'| **Quiet**: with nothing to show, how often the model also showed nothing | (watch) | {f(k["quiet"])} '
        f'| 100% | |',
        '',
        f'Speed detail: {k["changes"]} shabad changes; caught within 15 / 30 / 60 s: {f(k["caught_15"])} / '
        f'{f(k["caught_30"])} / {f(k["caught_60"])}; the model was first on {f(k["first"])} of them; typically '
        f'{when(k["median_delay_s"])} the person. Cold starts (recording began with the click that opened the '
        f'shabad, so the model was only starting up): {k["cold_starts"]}, shown typically {num(k["median_cold_s"]) if k["median_cold_s"] is not None else "n/a"} s later; '
        'not counted as switches.', '',
        f'How answers are given: EQUIVALENT means accuracy within 1 point of the person, '
        f'{100 + SPEED_EDGES[1]}%+ of shabad changes caught within {CATCH_S} s, and {100 + LINE_EDGES[1]}%+ on the right '
        f'line with {100 + LINE_SPEED_EDGES[1]}%+ of line changes caught within {LINE_CATCH_S} s. '
        'An answer is given only when the whole 90% range of the result sits in one level.', '',
    ]
    if changes:
        lines += ['**Every shabad change**', '', '| Tester | Service | When | Changed to | Model |',
                  '|---|---|---|---|---|']
        lines += [f'| {n} | {sess[:16]} | {c["at"]} | {review.title(c["human"])} | '
                  f'{"not within 3 min" if c["delay"] is None else when(c["delay"]) + " the person"} |'
                  for n, sess, c in changes]
        lines.append('')
    by = {}
    for n, g, sc in per_session:
        e = by.setdefault((n, g), [0, {}])
        e[0] += 1
        add(e[1], sc)
    lines += ['**Per tester** (percentages, higher is better)', '',
              '| Tester | Gurdwara | Services | Hours | Accuracy (model / person) | Speed: caught within 30 s '
              '| Right line | Line caught within 5 s |', '|---|---|---|---|---|---|---|---|']
    for (n, g), (cnt, sc) in sorted(by.items()):
        x = kpis(sc)
        lines.append(f'| {n} | {g} | {cnt} | {x["scored_h"]} | {f(x["accuracy"])} / {f(x["tester_accuracy"])} '
                     f'| {f(x["caught_30"])} | {f(x["right_line"])} | {f(x["line_caught_5"])} |')
    return lines, {'kpis': k, 'accuracy': acc[0], 'speed': spd[0], 'lines': lin[0]}


def sessions(root):
    """Every session folder under raw/ (any depth): (tester id, date, session id, folder)."""
    raw = os.path.join(root, 'raw')
    found = []
    for dirpath, dirnames, filenames in os.walk(raw):
        if 'session.json' in filenames or any(f.endswith('.jsonl') for f in filenames):
            dirnames[:] = []
            sess = os.path.basename(dirpath)
            try:
                meta = json.load(open(os.path.join(dirpath, 'session.json')))
            except (OSError, json.JSONDecodeError):
                meta = {}
            tester = (meta.get('tester') or {}).get('id') or os.path.basename(os.path.dirname(os.path.dirname(dirpath)))
            found.append((sess, tester, sess[:10], dirpath))
    for sess, tester, day, d in sorted(found):
        yield tester, day, sess, d


VERIFIED_COLS = ['success_pct', 'line_success_pct', 'found_pct', 'median_delay_s', 'worst_delay_s', 'scored_min']


def table(title, rows, cols):
    out = [f'**{title}**', '', '| who | ' + ' | '.join(cols) + ' |', '|' + '---|' * (len(cols) + 1)]
    out += [f'| {name} | ' + ' | '.join(str(r[c]) for c in cols) + ' |' for name, r in rows]
    return out


def run(root, write=True):
    """Score every session: RAW (trusting the sevadaar), the review queue, and VERIFIED
    (RAW plus the verdicts in review/verdicts.jsonl)."""
    vs = review.verdicts(os.path.join(root, 'review', 'verdicts.jsonl'))
    index, items_all, per_session, changes = [], [], [], []
    total, total_v, by_tester, by_tester_v = {}, {}, {}, {}
    for tester, day, sess, d in sessions(root):
        res = score_session(d)
        sc = res['raw']
        items = review.build_items(sess, d, res)
        items_all += items
        fixes = review.fixes_for(items, vs)
        res_v = score_session(d, fixes) if fixes else res
        res_v['raw']['testerWrong'] = sum(f['to'] - f['from'] for f in fixes)
        try:
            meta = json.load(open(os.path.join(d, 'session.json')))
        except (OSError, json.JSONDecodeError):
            meta = {}
        t = meta.get('tester') or {}
        who = t.get('name') or tester
        pending = [it for it in items if it['id'] not in vs]
        row = {'tester': tester, 'name': who, 'gurdwara': t.get('gurdwara', ''), 'date': day, 'session': sess,
               'app': meta.get('app'), 'build': meta.get('build'), 'platform': meta.get('platform'),
               **summarize(sc), 'verified': summarize(res_v['raw']), 'fixes': len(fixes),
               'to_review': len(pending)}
        index.append(row)
        per_session.append((who, row['gurdwara'], res_v['raw']))
        changes += [(who, sess, c) for c in res_v['switches']]
        add(total, sc)
        add(total_v, res_v['raw'])
        add(by_tester.setdefault(who, {}), sc)
        add(by_tester_v.setdefault(who, {}), res_v['raw'])
        if write:
            out = os.path.join(root, 'derived', sess)
            os.makedirs(out, exist_ok=True)
            with open(os.path.join(out, 'segments.jsonl'), 'w') as f:
                f.writelines(json.dumps(s) + '\n' for s in res['segments'])
            json.dump({**row, 'raw': sc, 'verified_raw': res_v['raw'], 'fixes_applied': fixes,
                       'switches': res['switches']}, open(os.path.join(out, 'score.json'), 'w'), indent=1)
            with open(os.path.join(out, 'listen.jsonl'), 'w') as f:
                f.writelines(json.dumps(x) + '\n' for x in res['listen'])
    if write:
        os.makedirs(os.path.join(root, 'index'), exist_ok=True)
        with open(os.path.join(root, 'index', 'sessions.jsonl'), 'w') as f:
            f.writelines(json.dumps(r) + '\n' for r in index)
        os.makedirs(os.path.join(root, 'review'), exist_ok=True)
        with open(os.path.join(root, 'review', 'queue.jsonl'), 'w') as f:
            f.writelines(json.dumps(it) + '\n' for it in items_all)
    cols = list(summarize({**{k: 0 for k in SUM_KEYS}, 'switchDelays': []}).keys())
    raw_rows = [(f"{r['name']} {r['session'][:16]}", r) for r in index]
    raw_rows += [(f'**{w} (all)**', summarize(sc)) for w, sc in by_tester.items()]
    ver_rows = [(f"{r['name']} {r['session'][:16]}", {**r['verified'], 'fixes': r['fixes'],
                                                       'to_review': r['to_review']}) for r in index]
    ver_rows += [(f'**{w} (all)**', {**summarize(sc), 'fixes': '', 'to_review': ''}) for w, sc in by_tester_v.items()]
    if total:
        raw_rows.append(('**ALL SANGAT**', summarize(total)))
        ver_rows.append(('**ALL SANGAT**', {**summarize(total_v), 'fixes': sum(r['fixes'] for r in index),
                                            'to_review': sum(r['to_review'] for r in index)}))
    card, card_numbers = scorecard(per_session, changes)
    lines = ['# Voice-Follow sangat benchmark', ''] + card + ['', '## Details', '']
    lines += table('RAW (trusting the sevadaar)', raw_rows, cols) + ['']
    lines += table('VERIFIED (with human verdicts on suspicious stretches)', ver_rows,
                   VERIFIED_COLS + ['fixes', 'to_review'])
    pending = [it for it in items_all if it['id'] not in vs]
    if pending:
        mins = sum(min(it['seconds'] + 10, 60) for it in pending) / 60
        lines += ['', f'**To review:** {len(pending)} items, about {mins:.0f} min of listening. '
                      'Run `python3 review.py`.', '',
                  '| session | when | type | why | tester | Voice-Follow |', '|---|---|---|---|---|---|']
        lines += [f"| {it['session'][:16]} | {it['from']}-{it['to']} ({it['seconds']} s) | {it['type']} | "
                  f"{', '.join(it['reasons'])} | {it['human']} | {it['system']} |" for it in pending]
    report = '\n'.join(lines)
    if write:
        os.makedirs(os.path.join(root, 'reports'), exist_ok=True)
        open(os.path.join(root, 'reports', f'{date.today().isoformat()}.md'), 'w').write(report + '\n')
    return index, total, report, total_v, card_numbers


def main():
    root = HERE
    if '--local' not in sys.argv:
        subprocess.run(AWS + ['s3', 'sync', f'{BUCKET}/raw', os.path.join(root, 'raw'), '--exclude', '*.webm',
                              '--only-show-errors'], check=True)
        subprocess.run(AWS + ['s3', 'cp', f'{BUCKET}/review/verdicts.jsonl', os.path.join(root, 'review', 'verdicts.jsonl'),
                              '--only-show-errors'], check=False, capture_output=True)
    _, _, report, _, _ = run(root)
    print(report)
    if '--publish' in sys.argv:
        for part in ('derived', 'index', 'reports', 'review'):
            subprocess.run(AWS + ['s3', 'sync', os.path.join(root, part), f'{BUCKET}/{part}', '--exclude', 'clips/*',
                                  '--only-show-errors'], check=True)


if __name__ == '__main__':
    main()
