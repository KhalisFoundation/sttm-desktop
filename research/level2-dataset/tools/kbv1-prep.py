# kbv1-prep.py : Karanbir Singh's Live Captioning for Gurbani Kirtan benchmark v1 (12 cases, annotations CC BY 4.0)
# -> GAB clips (wav cut at each case's UEM start), a local GAB benchmark dir (manifest + human lines/shabads),
#    and khalis-bench tests (kbv1-tests.json) for the replay suite `kbv1`.
import csv, glob, json, os, wave
GT = os.path.expanduser('~/AAI/models/benchmark/live-gurbani-captioning-benchmark-v1-main/test')
AUDIO = os.path.expanduser('~/AAI/models/benchmark/audio')
CLIPS = os.path.expanduser('~/personal/live-darbar-venues/clips')
BENCH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'kbv1-bench')
DS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HDR = 'id,content_folder,bani,gurdwara,acoustics,split,duration_s,suite_jobs,cache,cache_id,lines_n,lines_source,shabads_n,truth_provenance,origin,source_file,reader,audio,notes,session'.split(',')
rows, tests = [], []
for f in sorted(glob.glob(f'{GT}/*.json')):
    g = json.load(open(f)); case = os.path.basename(f)[:-5]; vid = g['video_id']
    cid = 'kbv1_' + case.replace('_cold', '_c')
    off = float(g['uem']['start'])
    src = wave.open(f'{AUDIO}/{vid}_16k.wav'); sr = src.getframerate(); n = src.getnframes()
    src.setpos(min(n, round(off * sr))); pcm = src.readframes(n); src.close()
    out = f'{CLIPS}/{cid}.wav'
    w = wave.open(out, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm); w.close()
    dur = round((n - round(off * sr)) / sr, 2)
    segs = [s for s in sorted(g['segments'], key=lambda s: s['start']) if s['end'] > off]
    lines = [(s['verse_id'], round(max(s['start'], off) - off, 2), round(s['end'] - off, 2)) for s in segs]
    sid = segs[0]['shabad_id']
    d = f'{BENCH}/1-kirtan-shabad/{cid}'; os.makedirs(d, exist_ok=True)
    with open(f'{d}/lines.csv', 'w') as fh:
        fh.write('verseId,start_s,end_s,source,confidence\n'); [fh.write(f'{v},{a},{b},human,\n') for v, a, b in lines]
    with open(f'{d}/shabads.csv', 'w') as fh:
        fh.write('shabadId,start_s,end_s,source\n'); fh.write(f'{sid},{lines[0][1]},{lines[-1][2]},human\n')
    rows.append({'id': cid, 'content_folder': '1-kirtan-shabad', 'gurdwara': 'Karanbir v1 (YouTube kirtan)', 'acoustics': 'recording', 'split': 'dev',
                 'duration_s': dur, 'suite_jobs': f'kbv1:{cid}', 'cache': 'yes', 'cache_id': cid, 'lines_n': len(lines), 'lines_source': 'human', 'shabads_n': 1,
                 'truth_provenance': f"Karanbir Singh benchmark v1 test/{case}.json (hand-reviewed; CC BY 4.0); clip starts at its UEM start {off} s",
                 'origin': f'https://youtu.be/{vid}', 'source_file': f'{cid}.wav', 'audio': f'1-kirtan-shabad/{cid}/audio.wav',
                 'notes': 'tags: karanbir-v1; cache: recorded on Mac', 'session': ''})
    tests.append({'name': cid, 'dataset': 'karanbir-v1', 'clip': f'{cid}.wav', 'shabads': [sid], 'seconds': dur,
                  'timeline': [{'t': a, 'verseId': v, 'shabadId': sid} for v, a, b in lines]})
with open(f'{BENCH}/manifest.csv', 'w', newline='') as fh:
    wr = csv.DictWriter(fh, fieldnames=HDR); wr.writeheader(); [wr.writerow({k: r.get(k, '') for k in HDR}) for r in rows]
json.dump(tests, open(f'{DS}/kbv1-tests.json', 'w'), indent=1)
print(len(rows), 'cases;', round(sum(r['duration_s'] for r in rows) / 60, 1), 'min of audio')
