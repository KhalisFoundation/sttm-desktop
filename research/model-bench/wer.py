#!/usr/bin/env python3
"""wer.py - WER / CER of each speech model on the benchmark's human-timed pangtis (see README.md, "WER / CER").

hit@5 (score.js) asks "did the right Shabad come up?". This asks the component question "how accurately does the model
transcribe a pangti?", on the same clips:
  - Segments: every lines.csv row whose source is human or the broadcaster's caption (never aligned-*, which were cut
    with Karanbir's model), inside the clip's [start, end]. Each segment is transcribed whole (pangtis over 20 s in equal parts of at most
    20 s, the most Karanbir's model accepts), batch 1, greedy CTC.
  - Reference: that pangti's text from the pinned corpus (BaniDB text, by verseId; never edited).
  - Both sides get the same normalisation before scoring: Unicode NFC, drop ॥ । digits and punctuation, single spaces.
  - WER / CER: jiwer over all segments of a behaviour (total errors / total reference words or letters).
  - Edge-tolerant CER: label times are approximate (broadcast captions run about 0.5 s late, so a segment often loses
    the pangti's first word and gains the next one's), and kirtan sings a pangti two or more times inside its labelled
    time. So each segment is also transcribed with PAD_S (1 s) of extra audio on both sides, and scored against the
    best-matching stretch of that text (words before and after it are free), with the pangti repeated 1-4 times,
    whichever fits best. Plain WER / CER (jiwer, exact label times) are shown as well. The difference from Karanbir's
    model gets a 95% interval from resampling whole clips (2000 draws, seed 12345; only with 3+ clips).

  python wer.py --models karanbir,jaspal-v0,jaspal-v1,jaspal-v2 --md results-wer.md --json results-wer.json
"""
import argparse, csv, json, os, platform, re, sys, unicodedata
from importlib.metadata import version

import jiwer
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from infer import MODELS, SHA256, SR, Model, read_wav, sha256  # noqa: E402

MAX_S = 20.0
PAD_S = 1.0
DROP = re.compile(r'[॥।0-9੦-੯.,;:!?|"\'()\[\]-]+')


def norm(s):
    return ' '.join(DROP.sub(' ', unicodedata.normalize('NFC', s or '')).split())


def segments(clip, data, verse_text):
    seen, out = set(), []
    with open(os.path.join(data, 'clips', clip['id'], 'lines.csv'), encoding='utf8') as f:
        for r in csv.DictReader(f):
            if not r['start_s'] or not r['end_s'] or r['source'].startswith('aligned'):
                continue
            a, b, v = float(r['start_s']), float(r['end_s']), int(r['verseId'])
            if (v, a, b) in seen or a < clip['start'] or b > clip['end'] or b - a < 0.5 or not norm(verse_text.get(v)):
                continue
            seen.add((v, a, b))
            out.append({'verseId': v, 'start': a, 'end': b, 'source': r['source']})
    return sorted(out, key=lambda s: s['start'])


def transcribe(name, sample, data, out, verse_text, threads):
    _, f, tok, blank, fe = MODELS[name]
    d = os.path.join(data, 'models', name)
    paths = [os.path.join(d, f), os.path.join(d, tok)] + ([os.path.join(d, fe)] if fe else [])
    for p in paths:
        want = SHA256.get(f'{name}/{os.path.basename(p)}')
        if want and sha256(p) != want:
            sys.exit(f'{p}: sha256 differs from the pinned one (re-run fetch.py)')
    key = {'files': [sha256(p) for p in paths], 'blank': blank, 'max_s': MAX_S, 'pad_s': PAD_S}
    od = os.path.join(out, name)
    os.makedirs(od, exist_ok=True)
    mp = os.path.join(od, 'meta.json')
    prev = json.load(open(mp)).get('key') if os.path.exists(mp) else None
    json.dump({'key': key}, open(mp, 'w'))
    m = None
    for c in sample['clips']:
        fp = os.path.join(od, f"{c['id']}.jsonl")
        segs = segments(c, data, verse_text)
        if not segs or (os.path.exists(fp) and prev == key):
            continue
        m = m or Model(paths[0], paths[1], blank, paths[2] if fe else None, threads)
        pcm = read_wav(os.path.join(data, 'clips', c['id'], 'audio.wav'))
        cut = lambda a, b: pcm[max(0, int(round(a * SR))):int(round(b * SR))]
        rows = [dict(s, text=transcribe_long(m, cut(s['start'], s['end'])),
                     text_padded=transcribe_long(m, cut(s['start'] - PAD_S, s['end'] + PAD_S))) for s in segs]
        with open(fp + '.tmp', 'w', encoding='utf8') as fh:
            fh.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
        os.replace(fp + '.tmp', fp)
        print(f"{name} {c['id']}: {len(rows)} pangtis", flush=True)


def transcribe_long(m, w):
    # Karanbir's model accepts at most about 21 s, so every model hears pangtis longer than MAX_S as equal parts of at
    # most MAX_S, transcribed one by one and joined with a space.
    k = int(np.ceil(len(w) / (MAX_S * SR)))
    edges = np.linspace(0, len(w), k + 1).round().astype(int)
    return ' '.join(t for t in (m.transcribe(np.ascontiguousarray(w[a:b])) for a, b in zip(edges, edges[1:])) if t)


def char_errors(ref, hyp):
    o = jiwer.process_characters(ref, hyp)
    return o.substitutions + o.deletions + o.insertions, len(ref)


def edge_errors(ref, hyp):
    # Edit distance from ref to the best-matching stretch of hyp: hyp letters before and after that stretch are free.
    d = np.zeros(len(hyp) + 1, dtype=int)
    for i, rc in enumerate(ref, 1):
        prev, d = d, np.empty_like(d)
        d[0] = i
        sub = prev[:-1] + np.array([rc != hc for hc in hyp], dtype=int)
        for j in range(1, len(hyp) + 1):
            d[j] = min(sub[j - 1], prev[j] + 1, d[j - 1] + 1)
    return int(d.min()), len(ref)


def repeat_tolerant(ref, hyp, errors=char_errors):
    best = None
    for k in range(1, 5):
        e, n = errors(' '.join([ref] * k), hyp)
        if best is None or e / n < best[0] / best[1]:
            best = (e, n)
    return best


def score(models, sample, data, out, verse_text):
    rows, padded = {}, {}  # model -> clip -> [(ref, hyp)]; padded = hyp of the segment +-PAD_S
    for m in models:
        for c in sample['clips']:
            fp = os.path.join(out, m, f"{c['id']}.jsonl")
            if os.path.exists(fp):
                rs = [json.loads(l) for l in open(fp, encoding='utf8')]
                rows.setdefault(m, {})[c['id']] = [(norm(verse_text[r['verseId']]), norm(r['text'])) for r in rs]
                padded.setdefault(m, {})[c['id']] = [(norm(verse_text[r['verseId']]), norm(r['text_padded'])) for r in rs]
    base = next((m for m in models if m.startswith('karanbir')), None)
    # Edge-tolerant (errors, letters) per model and clip; the headline and the one compared with Karanbir.
    edge = {m: {c: np.array([repeat_tolerant(r, h, edge_errors) for r, h in ps]).sum(0) for c, ps in padded[m].items()}
            for m in models}
    rng = np.random.default_rng(12345)
    agg = []
    for tier, label in sample['tiers'].items():
        clips = [c['id'] for c in sample['clips'] if c['tier'] == tier and base in rows and c['id'] in rows[base]]
        if not clips:
            continue
        draws = rng.integers(0, len(clips), size=(2000, len(clips)))
        for m in models:
            pairs = [p for c in clips for p in rows[m][c]]
            refs, hyps = [r for r, _ in pairs], [h for _, h in pairs]
            per_clip = {c: np.array([char_errors(r, h) for r, h in rows[m][c]]).sum(0) for c in clips}
            et = sum(edge[m][c] for c in clips)
            r = {'tier': tier, 'model': m, 'clips': len(clips), 'pangtis': len(pairs),
                 'wer': round(100 * jiwer.wer(refs, hyps), 1), 'cer': round(100 * jiwer.cer(refs, hyps), 1),
                 'cer_clip_mean': round(100 * float(np.mean([e / n for e, n in per_clip.values()])), 1),
                 'cer_edge_tolerant': round(100 * et[0] / et[1], 1),
                 'cer_edge_tolerant_clip_mean': round(100 * float(np.mean([edge[m][c][0] / edge[m][c][1] for c in clips])), 1)}
            if m != base and len(clips) >= 3:
                rate = lambda mm, idx: sum(edge[mm][clips[i]][0] for i in idx) / sum(edge[mm][clips[i]][1] for i in idx)
                diff = lambda idx: 100 * (rate(m, idx) - rate(base, idx))
                ds = np.sort([diff(ix) for ix in draws])
                lo, hi = round(float(ds[49]), 1), round(float(ds[1949]), 1)
                # With few clips the resampling has few distinct draws (4 clips: 35), so 'clear' needs 5+ clips.
                r['edge_vs_baseline'] = {'diff': round(diff(range(len(clips))), 1), 'ci95': [lo, hi],
                                         'clear': len(clips) >= 5 and (lo > 0 or hi < 0)}
            agg.append(r)
    return agg


def len_ok(r):
    return r['clips'] >= 5


NOTE = ('Edge-tolerant CER is the headline; plain WER / CER on exact label times count repeated singing and late captions as '
        'errors. Only behaviours with human or broadcast-caption pangti times appear: kirtan (mixer feed), Akhand Kirtan and '
        'paath (hall) have only model-aligned times, so they are left out. Rows with 1-2 clips are examples, not evidence. '
        'Pangtis are scored inside the same [start, end] of each clip as hit@5, so the longer recordings contribute only that '
        'part. Pangtis over 20 s (39 of 81 on hall kirtan) are cut into equal parts for every model.\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='karanbir,jaspal-v0,jaspal-v1,jaspal-v2')
    ap.add_argument('--data', default=os.path.join(HERE, 'data'))
    ap.add_argument('--out', default=os.path.join(HERE, 'transcripts-lines'))
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--score-only', action='store_true')
    ap.add_argument('--md'); ap.add_argument('--json')
    a = ap.parse_args()
    sample = json.load(open(os.path.join(HERE, 'sample.json')))
    verse_text = {r['verseId']: r['text'] for r in json.load(open(os.path.join(a.data, 'scoring', 'corpus.json'), encoding='utf8'))}
    models = a.models.split(',')
    if not a.score_only:
        for m in models:
            transcribe(m, sample, a.data, a.out, verse_text, a.threads)
    agg = score(models, sample, a.data, a.out, verse_text)
    L = ['| Behaviour | Model | Clips | Pangtis | WER % | CER % | CER edge-tolerant % (per-clip avg) | edge-tolerant vs Karanbir (95% CI) |',
         '|---|---|---|---|---|---|---|---|']
    for r in agg:
        v = r.get('edge_vs_baseline')
        vs = (f"{v['diff']:+} [{v['ci95'][0]}, {v['ci95'][1]}] {'clear' if v['clear'] else 'not clear' if len_ok(r) else 'too few clips to call'}" if v
              else 'baseline' if r['model'].startswith('karanbir') else 'too few clips')
        L.append(f"| {sample['tiers'][r['tier']]} | {r['model']} | {r['clips']} | {r['pangtis']} | {r['wer']} | {r['cer']} | "
                 f"{r['cer_edge_tolerant']} ({r['cer_edge_tolerant_clip_mean']}) | {vs} |")
    md = '\n'.join(L) + '\n\n' + NOTE
    print(md)
    if a.md:
        open(a.md, 'w', encoding='utf8').write(md)
    if a.json:
        json.dump({'jiwer': version('jiwer'), 'onnxruntime': version('onnxruntime'), 'machine': platform.machine(), 'agg': agg}, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
