#!/usr/bin/env python3
"""Known-answer test for benchmark.py: a hand-built 100 s session whose every number is worked
out by hand below. Run: python3 test_benchmark.py  (exits non-zero on any mismatch)."""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchmark as B  # noqa: E402

# Timeline (seconds), 320 s. Singing heard 10-279 (activity), so "heard" covers 5-284.
#   2-5    mic_error .. mic_restarted                                   -> 4 s PAUSED
#   0-39   sevadaar shows nothing (idle)
#          10-19 system on shabad 5 (never opened by the human)         -> 10 s FALSE ALARM
#          25-39 system on shabad 1; human opens 1 at 40                -> 15 s IDLE EARLY
#   40     human opens shabad 1 line 11 (switch 1: system there since 25 -> delay -15)
#   70     human line 12; system line 12 at 72                         (lines within +-10 s)
#   100-101 human flicks to shabad 9 for 2 s                           -> BLIP, ignored
#   130    human switches to shabad 2 line 21; system stays on 1 till 170 (switch 2: +40)
#          130-134 AGREE (lag), 135-169 BEHIND 35 s (still on the shabad just left)
#          -> one LISTEN entry 2:15-2:50, audio-000 @ 2:15
#   200    system moves to shabad 3; human opens 3 at 220 (switch 3: -20)
#          200-214 EARLY 15 s, 215-219 AGREE (lag)
#   240-259 computer asleep (gap event)                                 -> 20 s PAUSED
#   255    system drifts to line 32 (human stays on 31)
#   270-274 system shows shabad 7, nobody's shabad                     -> 5 s WRONG
#          lines disagree 265-269 and 275-280
#   285-299 nothing heard, shabad 3 up, system on 3                    -> 15 s HELD agree
#   300-319 human shows a slide; system still on 3                     -> 15 s LINGER
#   300-304 hidden Voice-Follow reports itself down (vf_down..vf_up)   -> 5 s PAUSED (vfDown)
# States: kirtan 40-239 + 260-284 = 225, held 15, idle 0-1,6-39,305-319 = 51, paused 29.
# Kirtan: agree 40-134, 170-199, 215-239, 260-269, 275-284 = 170; early 15; behind 35; wrong 5.
# Lines (agreed, sevadaar moved a line within 60 s): 40-134 (95), 170-190 (21), 220-239 (20),
# 260-269 + 275-280 (16) = 152. Compared within +-3 s: disagree 133-134 (the sevadaar has
# left shabad 1) and all of 260-269 + 275-280 (the model is on line 32) -> 152 - 18 = 134.
# Steadiness: the model changed shabad 6 times (5 at 10, 1 at 25, 2 at 170, 3 at 200, 7 at
# 270, 3 at 275); right: 1, 2, 3, 3 -> 4 of 6. It moved line once while both were on the
# same shabad (12 at 72; the sevadaar was on 12 from 70) -> 1 of 1 (the move at 255 was asleep).
EXPECT = {
    'kirtan': 225, 'held': 15, 'idle': 51, 'paused': 29, 'vfDown': 5,
    'agree': 170, 'early': 15, 'behind': 35, 'wrong': 5, 'none': 0,
    'heldAgree': 15, 'heldBehind': 0, 'heldWrong': 0, 'heldNone': 0,
    'idleQuiet': 11, 'idleEarly': 15, 'linger': 15, 'falseAlarm': 10,
    'lineSeconds': 152, 'lineAgree': 134,
    'switches': 3, 'matched': 3, 'switchDelays': [-20, -15, 40],
    # One sevadaar line change on a shabad the model also shows: 70 (line 11 -> 12); model at 72.
    'lineChanges': 1, 'lineFound': 1, 'lineDelays': [2],
    'modelSwitches': 6, 'modelSwitchesRight': 4, 'modelLineMoves': 1, 'modelLineMovesRight': 1,
}
EXPECT_LISTEN = [{'fromS': 135, 'toS': 170, 'from': '2:15', 'to': '2:50', 'seconds': 35, 'kind': 'behind', 'human': 'shabad:2',
                  'system': 'shabad:1', 'audio': {'file': 'audio-000.webm', 'offset': '2:15'}}]

# The words heard during 135-169 are shabad 1's (Voice-Follow's), so review flags that
# stretch as suspicious ('words'). A person says "Voice-Follow right": the fix makes
# shabad 1 the truth for 130-169 (from LAG_S before the stretch), so VERIFIED has:
#   agree 170 + 35 = 205, behind 0; the switch to shabad 2 is now at 170 (delay 0);
#   lines lose 130-134 (fixed seconds carry no line) and gain 191-199 and 215-219 (the
#   line change now happens at 170, so the sevadaar counts as moving lines until 230):
#   161; within +-3 s they disagree on 215-216 (the sevadaar reaches shabad 3 at 220)
#   and 260-269 + 275-280 -> 143. Words: every telling heard word (in only one of the two shabads) is
#   shabad 1's, so the share is 1.0.
SHABADS = {
    '1': [[11, 'ਹਮ ਅੰਧੁਲੇ ਅੰਧ ਬਿਖੈ ਬਿਖੁ ਰਾਤੇ ਕਿਉ ਚਾਲਹ ਗੁਰ ਚਾਲੀ ॥'],
          [12, 'ਸਤਗੁਰੁ ਦਇਆ ਕਰੇ ਸੁਖਦਾਤਾ ਹਮ ਲਾਵੈ ਆਪਨ ਪਾਲੀ ॥੧॥']],
    '2': [[21, 'ਮੇਰਾ ਮਨੁ ਲੋਚੈ ਗੁਰ ਦਰਸਨ ਤਾਈ ॥'], [22, 'ਬਿਲਪ ਕਰੇ ਚਾਤ੍ਰਿਕ ਕੀ ਨਿਆਈ ॥']],
}
HEARD = 'ਹਮ ਅੰਧੁਲੇ ਅੰਧ ਬਿਖੈ ਬਿਖੁ ਰਾਤੇ ਕਿਉ ਚਾਲਹ ਗੁਰ ਚਾਲੀ ਸਤਗੁਰੁ ਦਇਆ ਕਰੇ ਸੁਖਦਾਤਾ'
EXPECT_ITEM = {'type': 'suspicious', 'reasons': ['words'], 'fromS': 135, 'toS': 170, 'kind': 'behind',
               'human': 'shabad:2', 'system': 'shabad:1', 'wordsSystem': 1.0,
               'audio': 'audio-000.webm', 'audioOffset': 135}
EXPECT_VERIFIED = {'agree': 205, 'early': 15, 'behind': 0, 'wrong': 5, 'none': 0,
                   'lineSeconds': 161, 'lineAgree': 143, 'switches': 3, 'matched': 3,
                   'switchDelays': [-20, -15, 0]}


def write(d, name, rows):
    with open(os.path.join(d, name), 'w') as f:
        f.writelines(json.dumps(r) + '\n' for r in rows)


def build(root):
    d = os.path.join(root, 'raw', 'testerA', '2026-01-01', '2026-01-01T00-00-00-000Z')
    os.makedirs(d)
    json.dump({'tester': {'name': 'Test Singh', 'gurdwara': 'Test'}}, open(os.path.join(d, 'session.json'), 'w'))
    h = lambda t, s, v, slide=None: {'t': t, 'shabadId': s, 'verseId': v, 'bani': None, 'slide': slide}
    write(d, 'human.jsonl', [
        h(0, None, ''), h(40, 1, 11), h(70, 1, 12), h(100, 9, 91), h(102, 1, 12),
        h(130, 2, 21), h(220, 3, 31), h(300, 3, 31, 'vwihgurU'),
    ])
    write(d, 'system.jsonl', [
        {'t': 10, 'shabadId': 5, 'verseId': 51}, {'t': 20, 'shabadId': None, 'verseId': None},
        {'t': 25, 'shabadId': 1, 'verseId': 11}, {'t': 72, 'verseId': 12},
        {'t': 170, 'shabadId': 2, 'verseId': 21}, {'t': 200, 'shabadId': 3, 'verseId': 31},
        {'t': 255, 'verseId': 32}, {'t': 270, 'shabadId': 7, 'verseId': 71},
        {'t': 275, 'shabadId': 3, 'verseId': 32},
    ])
    write(d, 'activity.jsonl', [
        {'t': t, 'level': 0.05 if 10 <= t <= 279 and not 240 <= t < 260 else 0.0,
         'letters': 10 if 10 <= t <= 279 and not 240 <= t < 260 else 0,
         'text': HEARD if 135 <= t < 170 else ''}
        for t in range(320)
    ])
    write(d, 'events.jsonl', [
        {'t': 0, 'type': 'audio_segment', 'file': 'audio-000.webm'},
        {'t': 2, 'type': 'mic_error', 'error': 'test'},
        {'t': 6, 'type': 'mic_restarted'},
        {'t': 150, 'type': 'audio_segment', 'file': 'audio-001.webm'},
        {'t': 260, 'type': 'gap', 'from': 240},
        {'t': 300, 'type': 'vf_down', 'status': 'error: test'},
        {'t': 305, 'type': 'vf_up', 'status': 'detecting: '},
    ])


def main():
    root = tempfile.mkdtemp(prefix='vfbench-')
    B.review._shabads = {k: v for k, v in SHABADS.items()}
    bad = []
    try:
        build(root)
        # 1. RAW: every rule of score.js.
        index, total, report, _, _ = B.run(root)
        bad += [(k, v, total.get(k)) for k, v in EXPECT.items() if total.get(k) != v]
        # Headline: success = (agree 170 + early 15) / (185 + wrong 5) = 97.4%; lines 134/152.
        head = {k: index[0][k] for k in ('success_pct', 'line_success_pct', 'found_pct', 'scored_min',
                                         'catch_up_min', 'vf_down_min')}
        want = {'success_pct': 97.4, 'line_success_pct': 88.2, 'found_pct': 100.0, 'scored_min': 3.2,
                'catch_up_min': 0.6, 'vf_down_min': 0.1}
        if head != want:
            bad.append(('headline', want, head))
        sess = '2026-01-01T00-00-00-000Z'
        listen = [json.loads(l) for l in open(os.path.join(root, 'derived', sess, 'listen.jsonl'))]
        if listen != EXPECT_LISTEN:
            bad.append(('listen', EXPECT_LISTEN, listen))
        # 2. Review queue: exactly the one suspicious stretch (no audits under 1 h of kirtan).
        queue = [json.loads(l) for l in open(os.path.join(root, 'review', 'queue.jsonl'))]
        got = [{k: it[k] for k in EXPECT_ITEM} for it in queue]
        if got != [EXPECT_ITEM]:
            bad.append(('queue', [EXPECT_ITEM], got))
        if index[0]['to_review'] != 1:
            bad.append(('to_review', 1, index[0]['to_review']))
        # 3. VERIFIED after "Voice-Follow right" on that item.
        with open(os.path.join(root, 'review', 'verdicts.jsonl'), 'w') as f:
            f.write(json.dumps({'id': queue[0]['id'], 'verdict': 'model'}) + '\n')
        index, total, report, total_v, card = B.run(root)
        bad += [('verified ' + k, v, total_v.get(k)) for k, v in EXPECT_VERIFIED.items() if total_v.get(k) != v]
        bad += [('raw unchanged ' + k, v, total.get(k)) for k, v in EXPECT.items() if total.get(k) != v]
        # Verified headline: (205 + 15) / (220 + 5) = 97.8%; lines 143/161 = 88.8%.
        vh = {k: index[0]['verified'][k] for k in ('success_pct', 'line_success_pct')}
        if vh != {'success_pct': 97.8, 'line_success_pct': 88.8}:
            bad.append(('verified headline', '97.8 / 88.8', vh))
        if index[0]['to_review'] != 0 or index[0]['fixes'] != 1:
            bad.append(('after verdict', '0 to review, 1 fix', (index[0]['to_review'], index[0]['fixes'])))
        # Scorecard (reviewed; one service, so every resample is the same and answers are exact).
        # Scores out of 100, higher is better; gap = model - person.
        #   accuracy: model right 220 of 225 s with a shabad up = 97.8; person ruled wrong 40 s
        #             (130-169) -> 185/225 = 82.2; gap +15.6 -> MUCH BETTER
        #   speed: delays [-20, -15, 0], all within 30 s -> 100; gap 0 -> EQUIVALENT
        #   lines: right line 143/161 = 88.8 (gap -11.2 -> MUCH WORSE); the one line change
        #          caught in 2 s -> 100 (EQUIVALENT); the worse of the two -> MUCH WORSE
        #   steadiness: shabad changes right 4 of 6 = 66.7; line moves right 1 of 1 = 100
        k = card['kpis']
        r1 = lambda x: None if x is None else round(x, 1)
        got = (card['accuracy'], card['speed'], card['lines'], r1(k['accuracy']), r1(k['tester_accuracy']),
               r1(k['caught_30']), r1(k['first']), k['median_delay_s'], r1(k['right_line']), r1(k['line_caught_5']),
               r1(k['switch_right']), r1(k['line_move_right']))
        want = ('MUCH BETTER', 'EQUIVALENT', 'MUCH WORSE', 97.8, 82.2, 100.0, 100.0, -15, 88.8, 100.0, 66.7, 100.0)
        if got != want:
            bad.append(('scorecard', want, got))
        if '(early lean: 1 of 5 services)' not in report:
            bad.append(('lean label', 'shown', 'missing'))
        # Verdict bands and the "range must sit in one level" rule.
        checks = [(B.level(0, B.ACCURACY_EDGES), 'EQUIVALENT'), (B.level(-1.5, B.ACCURACY_EDGES), 'WORSE'),
                  (B.level(2, B.ACCURACY_EDGES), 'BETTER'), (B.level(-50, B.SPEED_EDGES), 'MUCH WORSE'),
                  (B.level(-10, B.SPEED_EDGES), 'EQUIVALENT'), (B.worst('EQUIVALENT', 'WORSE'), 'WORSE'),
                  (B.verdict([-8] * 50 + [-12] * 50, lambda x: B.level(x, B.SPEED_EDGES))[0],
                   'between WORSE and EQUIVALENT')]
        bad += [('band', w, g) for g, w in checks if g != w]
        # 5. Cold start: a human switch within 15 s of the session start is start-up, not a
        #    slow switch; a second early switch counts normally.
        cold = B.score_session_timelines({
            'human': [{'t': 0, 'shabadId': None, 'verseId': None, 'bani': None, 'slide': None},
                      {'t': 1, 'shabadId': 1, 'verseId': 11, 'bani': None, 'slide': None},
                      {'t': 10, 'shabadId': 2, 'verseId': 21, 'bani': None, 'slide': None}],
            'system': [{'t': 7, 'shabadId': 1, 'verseId': 11}, {'t': 30, 'shabadId': 2, 'verseId': 21}],
            'activity': [{'t': t, 'level': 0.05, 'letters': 10} for t in range(60)], 'events': []})
        c = cold['raw']
        if (c['switchesCold'], c['coldDelays'], c['switches'], c['switchDelays']) != (1, [6], 1, [20]):
            bad.append(('cold start', (1, [6], 1, [20]), (c['switchesCold'], c['coldDelays'], c['switches'], c['switchDelays'])))
        # 4. An audit marked "both wrong" becomes an unknown-truth fix; "tester right" none.
        audit = {'id': 'a', 'type': 'audit', 'fromS': 50, 'toS': 80, 'system': 'shabad:1'}
        sus = {**queue[0], 'id': 's'}
        fx = B.review.fixes_for([audit, sus], {'a': {'verdict': 'both_wrong'}, 's': {'verdict': 'tester'}})
        if fx != [{'from': 50, 'to': 80, 'truth': 'unknown'}]:
            bad.append(('audit fix', 'unknown 50-80', fx))
        print(report)
    finally:
        shutil.rmtree(root)
    n = len(EXPECT) + 6 + 1 + 2 + len(EXPECT_VERIFIED) + 2 + len(EXPECT) + 1 + 12 + 1 + 7 + 1 + 1
    if bad:
        for k, want, got in bad:
            print(f'MISMATCH {k}: expected {want}, got {got}')
        sys.exit(1)
    print(f'PASS: all {n} known answers match')


if __name__ == '__main__':
    main()
