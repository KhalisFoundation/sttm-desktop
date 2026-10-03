#!/usr/bin/env python3
"""Human review of suspicious stretches: as little listening as possible.

The benchmark scores everything automatically, trusting the sevadaar (the RAW score).
This module then picks only the stretches where the sevadaar was probably wrong, so a
person listens to those alone and clicks a verdict; the VERIFIED score applies them.

    python3 review.py          # open the review page (http://localhost:8765)

Suspicious (sent to a person) - a disagreement of 20 s+ where Voice-Follow was not merely
searching, and one of:
    words   of the heard words found in only one of the two shabads, WORDS_SHARE+ are in
            Voice-Follow's (with the sevadaar showing nothing: WORDS_ALONE+ of all heard
            words are in Voice-Follow's shabad)
    later   the sevadaar opened Voice-Follow's shabad within LATER_S after the stretch
    stale   the sevadaar's line had not moved for STALE_LINE_S while singing went on
            (later/stale only count when the words do not clearly favour the sevadaar)
Not sent: the words clearly favour the sevadaar (a confirmed Voice-Follow error), or
Voice-Follow showed nothing (searching is a delay, not a disputed label).
Audit: one random agreed stretch per AUDIT_EVERY_S of kirtan, so verification can lower a
score as well as raise it (the sevadaar and Voice-Follow can be wrong together).

Verdicts are appended to review/verdicts.jsonl (last one per item wins) and synced to S3:
    suspicious + "model right"  -> truth = Voice-Follow's shabad for that stretch
    audit      + "both wrong"   -> truth = unknown (Voice-Follow counted wrong)
    "tester right" / "unsure"   -> no change
"""
import hashlib
import http.server
import json
import os
import subprocess
import sys
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.join(HERE, 'review')
VERDICTS = os.path.join(REVIEW, 'verdicts.jsonl')
SHABADS = os.path.join(HERE, 'shabads.json')
FFMPEG = os.path.expanduser('~/.local/bin/ffmpeg')

MIN_WORDS = 10        # fewer telling words heard than this: no word evidence
WORDS_SHARE = 0.7     # share of telling words in Voice-Follow's shabad that makes it suspicious
WORDS_BACK = 0.3      # at or below this the words back the sevadaar: a confirmed system error
WORDS_ALONE = 0.35
LATER_S = 300
STALE_LINE_S = 120
AUDIT_EVERY_S = 3600
AUDIT_LEN_S = 30
CLIP_PAD_S = 5
LAG_S = 5             # score.js C.LAG_S
CLIP_MAX_S = 60

_shabads = None


def shabad_text(key):
    """Lines of a shabad for a content key like 'shabad:2546' (None if unknown)."""
    global _shabads
    if not key or not key.startswith('shabad:'):
        return None
    if _shabads is None:
        try:
            _shabads = json.load(open(SHABADS, encoding='utf-8'))
        except OSError:
            _shabads = {}
    rows = _shabads.get(key.split(':', 1)[1])
    return [t for _, t in rows] if rows else None


def norm_word(w):
    """A Gurmukhi word reduced to its letters (vowel signs and nukta dropped)."""
    return ''.join(c for c in unicodedata.normalize('NFD', w) if '\u0a05' <= c <= '\u0a39' or c in '\u0a72\u0a73')


def title(key):
    """A readable name for a content key: the first words of the shabad's first line of
    Gurbani (skipping the raag/author heading), or the key itself if unknown."""
    lines = shabad_text(key)
    if not lines:
        return key or 'nothing'
    first = next((l for l in lines[1:] if len(l.split()) > 3), lines[0])
    return ' '.join(first.split()[:6])


def first_letters(text):
    """Gurmukhi first letters of each word."""
    return ''.join(n[0] for n in (norm_word(w) for w in (text or '').split()) if n)


_words = {}


def shabad_words(key):
    if key not in _words:
        lines = shabad_text(key)
        _words[key] = None if not lines else {n for l in lines for n in map(norm_word, l.split()) if len(n) >= 2}
    return _words[key]


def heard_words(activity, a, b):
    return [n for row in activity if a <= row.get('t', -1) < b and row.get('text')
            for n in map(norm_word, row['text'].split()) if len(n) >= 2]


def word_evidence(heard, system, human):
    """Share of the telling heard words that are in Voice-Follow's shabad (None: no evidence).
    Telling = in exactly one of the two shabads; with nothing on the sevadaar's screen, the
    share of all heard words that are in Voice-Follow's shabad."""
    sw = shabad_words(system)
    if not sw or not heard:
        return None
    if human is None:
        return sum(w in sw for w in heard) / len(heard) if len(heard) >= MIN_WORDS else None
    hw = shabad_words(human)
    if not hw:
        return None
    x = sum(w in sw and w not in hw for w in heard)
    y = sum(w in hw and w not in sw for w in heard)
    return x / (x + y) if x + y >= MIN_WORDS else None


def read_jsonl(path):
    out = []
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def audio_at(events, t):
    seg = None
    for e in sorted((e for e in events if e.get('type') == 'audio_segment'), key=lambda e: e.get('t', 0)):
        if e.get('t', 0) <= t:
            seg = e
    return (seg['file'], t - seg.get('t', 0)) if seg else (None, None)


def human_line_age(human_ev, t):
    """Seconds since the sevadaar last changed anything on screen, at time t."""
    last = None
    for e in human_ev:
        if e.get('t', 0) <= t:
            last = e.get('t', 0)
    return t - last if last is not None else 0


def build_items(sess, d, res):
    """Suspicious and audit items for one scored session."""
    activity = read_jsonl(os.path.join(d, 'activity.jsonl'))
    events = read_jsonl(os.path.join(d, 'events.jsonl'))
    human_ev = read_jsonl(os.path.join(d, 'human.jsonl'))
    runs = res['runs']
    items = []
    for x in res['listen']:
        if x['kind'] == 'none':
            continue
        a, b = x['fromS'], x['toS']
        share = word_evidence(heard_words(activity, a, b), x['system'], x['human'])
        reasons = []
        if share is not None:
            if x['human'] is not None and share <= WORDS_BACK:
                continue  # the words back the sevadaar: a confirmed Voice-Follow error
            if share >= (WORDS_ALONE if x['human'] is None else WORDS_SHARE):
                reasons.append('words')
        if any(r['human'] == x['system'] and b <= r['fromS'] <= b + LATER_S for r in runs):
            reasons.append('later')
        if human_line_age(human_ev, a) >= STALE_LINE_S:
            reasons.append('stale')
        if not reasons:
            continue
        file, off = audio_at(events, a)
        items.append({
            'id': f'{sess}:{a}-{b}', 'session': sess, 'type': 'suspicious', 'reasons': reasons,
            'fromS': a, 'toS': b, 'seconds': b - a, 'from': x['from'], 'to': x['to'], 'kind': x['kind'],
            'human': x['human'], 'system': x['system'],
            'wordsSystem': None if share is None else round(share, 2),
            'audio': file, 'audioOffset': off,
            'priority': (b - a) * (2 if 'words' in reasons else 1),
        })
    kirtan = res['raw']['kirtan']
    agreed = [r for r in runs if r['kind'] == 'agree' and r['toS'] - r['fromS'] >= AUDIT_LEN_S]
    for n in range(kirtan // AUDIT_EVERY_S):
        if not agreed:
            break
        h = int(hashlib.sha1(f'{sess}:{n}'.encode()).hexdigest(), 16)
        r = agreed[h % len(agreed)]
        a = r['fromS'] + (h // 7) % (r['toS'] - r['fromS'] - AUDIT_LEN_S + 1)
        b = a + AUDIT_LEN_S
        file, off = audio_at(events, a)
        items.append({
            'id': f'{sess}:{a}-{b}', 'session': sess, 'type': 'audit', 'reasons': ['random check'],
            'fromS': a, 'toS': b, 'seconds': AUDIT_LEN_S, 'from': f'{a // 60}:{a % 60:02d}',
            'to': f'{b // 60}:{b % 60:02d}', 'kind': 'agree', 'human': r['human'], 'system': r['system'],
            'wordsSystem': None, 'audio': file, 'audioOffset': off, 'priority': 0,
        })
    return items


def verdicts(path=VERDICTS):
    """Latest verdict per item id."""
    out = {}
    for v in read_jsonl(path):
        out[v['id']] = v
    return out


def fixes_for(items, vs):
    """Score fixes for one session from its items' verdicts."""
    fixes = []
    for it in items:
        v = vs.get(it['id'], {}).get('verdict')
        if it['type'] == 'suspicious' and v == 'model':
            # From LAG_S before: the stretch starts after the +-5 s lag the sevadaar already got.
            fixes.append({'from': max(0, it['fromS'] - LAG_S), 'to': it['toS'], 'truth': it['system']})
        if it['type'] == 'audit' and v == 'both_wrong':
            fixes.append({'from': it['fromS'], 'to': it['toS'], 'truth': 'unknown'})
    return fixes


# ---- review page ------------------------------------------------------------------------
PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Voice-Follow review</title>
<style>
body{font-family:-apple-system,Segoe UI,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#222}
.card{border:1px solid #ccc;border-radius:10px;padding:16px;margin:16px 0}
.cols{display:flex;gap:16px}.cols>div{flex:1;background:#f6f6f6;border-radius:8px;padding:10px;font-size:15px}
h3{margin:4px 0}.g{font-size:17px;line-height:1.6}.why{color:#666;font-size:13px}
button{font-size:15px;padding:8px 14px;margin:8px 8px 0 0;border-radius:6px;border:1px solid #888;cursor:pointer}
.done{opacity:.45}.v{font-weight:600}
</style></head><body>
<h2>Voice-Follow review</h2>
<p>Listen to each clip, then say who had the right shabad on screen. Only the stretches the
computer found suspicious are here, plus the occasional random check.</p>
<div id="list">Loading...</div>
<script>
const label={tester:'Tester right',model:'Voice-Follow right',both_wrong:'Both wrong',correct:'Both right',unsure:'Unsure'};
async function load(){
  const items=await (await fetch('/items')).json();
  const L=document.getElementById('list'); L.innerHTML='';
  if(!items.length){L.textContent='Nothing to review.';return;}
  items.forEach(it=>{
    const c=document.createElement('div'); c.className='card'+(it.verdict?' done':'');
    const btns=it.type==='audit'?['correct','both_wrong','unsure']:['tester','model','unsure'];
    const lines=t=>t?t.slice(0,8).join('<br>'):'<i>nothing on screen</i>';
    c.innerHTML=`<div class="why">${it.session.slice(0,16)} · ${it.from}–${it.to} (${it.seconds} s) · ${it.type}: ${it.reasons.join(', ')}
      ${it.wordsSystem!=null?` · telling words heard: ${Math.round(it.wordsSystem*100)}% Voice-Follow's shabad`:''}</div>
      <audio controls preload="none" src="/clip/${encodeURIComponent(it.id)}" style="width:100%;margin:8px 0"></audio>
      <div class="cols"><div><h3>Tester showed</h3><div class="g">${lines(it.humanText)}</div></div>
      <div><h3>Voice-Follow showed</h3><div class="g">${lines(it.systemText)}</div></div></div>
      <div>${btns.map(b=>`<button data-v="${b}">${label[b]}</button>`).join('')}
      <span class="v">${it.verdict?'Saved: '+label[it.verdict]:''}</span></div>`;
    c.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
      await fetch('/verdict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:it.id,verdict:b.dataset.v})});
      c.className='card done'; c.querySelector('.v').textContent='Saved: '+label[b.dataset.v];
    });
    L.appendChild(c);
  });
}
load();
</script></body></html>"""


def queue():
    try:
        return [json.loads(l) for l in open(os.path.join(REVIEW, 'queue.jsonl'), encoding='utf-8')]
    except OSError:
        return []


def session_dir(sess):
    """(S3 prefix such as raw/renton/arashdeep-singh/2026-10-01/<session>, local folder)."""
    raw = os.path.join(HERE, 'raw')
    for dirpath, dirnames, _ in os.walk(raw):
        if os.path.basename(dirpath) == sess:
            return os.path.relpath(dirpath, HERE).replace(os.sep, '/'), dirpath
    return None, None


def clip(it):
    """A short mp3 of the item, cut from the session's audio (2-minute segments, joined when
    the clip crosses a boundary; segments are downloaded from S3 if missing)."""
    out = os.path.join(REVIEW, 'clips', it['id'].replace(':', '_') + '.mp3')
    if os.path.exists(out):
        return out
    prefix, d = session_dir(it['session'])
    if not d:
        return None
    segs = sorted((e for e in read_jsonl(os.path.join(d, 'events.jsonl')) if e.get('type') == 'audio_segment'),
                  key=lambda e: e.get('t', 0))
    if not segs:
        return None
    start = max(0, it['fromS'] - CLIP_PAD_S)
    length = min(it['seconds'] + 2 * CLIP_PAD_S, CLIP_MAX_S)
    end = start + length
    # Segments overlapping [start, end): each runs from its t to the next segment's t.
    use = [s for i, s in enumerate(segs)
           if s.get('t', 0) < end and (i + 1 == len(segs) or segs[i + 1].get('t', 0) > start)]
    if not use:
        return None
    sys.path.insert(0, HERE)
    from benchmark import AWS, BUCKET  # noqa: E402
    files = []
    for s in use:
        f = os.path.join(d, s['file'])
        if not os.path.exists(f):
            subprocess.run(AWS + ['s3', 'cp', f"{BUCKET}/{prefix}/{s['file']}", f, '--only-show-errors'], check=False)
        if os.path.exists(f):
            files.append(f)
    if not files:
        return None
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if len(files) == 1:
        src = files[0]
    else:
        lst = out + '.txt'
        with open(lst, 'w') as f:
            f.writelines(f"file '{x}'\n" for x in files)
        src = out + '.joined.webm'
        subprocess.run([FFMPEG, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', src],
                       check=False)
        os.unlink(lst)
    offset = start - use[0].get('t', 0)
    subprocess.run([FFMPEG, '-loglevel', 'error', '-y', '-i', src, '-ss', str(max(0, offset)), '-t', str(length),
                    '-ac', '1', '-b:a', '64k', out], check=False)
    if src != files[0] and os.path.exists(src):
        os.unlink(src)
    return out if os.path.exists(out) else None

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header('content-type', ctype)
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/':
            return self.send(200, PAGE.encode(), 'text/html; charset=utf-8')
        if self.path == '/items':
            vs = verdicts()
            items = sorted(queue(), key=lambda it: (it['id'] in vs, it['type'] == 'audit', -it['priority']))
            for it in items:
                it['verdict'] = vs.get(it['id'], {}).get('verdict')
                it['humanText'], it['systemText'] = shabad_text(it['human']), shabad_text(it['system'])
            return self.send(200, json.dumps(items).encode(), 'application/json')
        if self.path.startswith('/clip/'):
            from urllib.parse import unquote
            iid = unquote(self.path[len('/clip/'):])
            it = next((x for x in queue() if x['id'] == iid), None)
            f = clip(it) if it else None
            if not f:
                return self.send(404, b'no audio', 'text/plain')
            return self.send(200, open(f, 'rb').read(), 'audio/mpeg')
        self.send(404, b'', 'text/plain')

    def do_POST(self):
        if self.path != '/verdict':
            return self.send(404, b'', 'text/plain')
        body = json.loads(self.rfile.read(int(self.headers['content-length'])))
        row = {'id': body['id'], 'verdict': body['verdict'], 'by': os.environ.get('USER', ''),
               'at': time.strftime('%Y-%m-%dT%H:%M:%S')}
        os.makedirs(REVIEW, exist_ok=True)
        with open(VERDICTS, 'a', encoding='utf-8') as f:
            f.write(json.dumps(row) + '\n')
        sys.path.insert(0, HERE)
        from benchmark import AWS, BUCKET  # noqa: E402
        subprocess.Popen(AWS + ['s3', 'cp', VERDICTS, f'{BUCKET}/review/verdicts.jsonl', '--only-show-errors'])
        self.send(200, b'{}', 'application/json')


def main():
    port = 8765
    print(f'Review page: http://localhost:{port}  ({len(queue())} items; Ctrl+C when done, '
          f'then run benchmark.py for the verified score)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
