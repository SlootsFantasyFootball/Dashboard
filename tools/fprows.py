#!/usr/bin/env python3
"""Build FantasyPros rest-of-season rows for the Trade Analyzer.

usage: python3 fprows.py <live index.html> <out rows.json> [YYYY-MM-DD]

Reads the get_projections (ros) results for QB/RB/WR/TE that Claude pulled through the
FantasyPros connection in the current session (saved under ~/.claude/projects), dated today
(or the date given). K/DST rows, strength-of-schedule stars, and any 0-projection QB kept
from before are carried over from the rows already in the live site's seed.
"""
import base64, glob, json, os, re, sys, datetime, collections

LIMIT = {'QB': 36, 'RB': 110, 'WR': 140, 'TE': 45}

def live_rows(index_path):
    x = open(index_path).read()
    tag = '<script type="text/plain" id="ll-doc">'
    i = x.index(tag) + len(tag); j = x.index('</script>', i)
    h = base64.b64decode(x[i:j]).decode()
    a = h.index('window.LL_SEED=') + len('window.LL_SEED='); b = h.index(';\n', a)
    return json.loads(h[a:b])['fp']['rows']

def candidates():
    root = os.path.expanduser('~/.claude/projects')
    for f in glob.glob(root + '/**/*', recursive=True):
        if not os.path.isfile(f) or os.path.getsize(f) < 200: continue
        if not (f.endswith('.jsonl') or f.endswith('.txt') or f.endswith('.json')): continue
        mt = os.path.getmtime(f)
        if f.endswith('.jsonl'):
            for line in open(f, errors='ignore'):
                if '"projections"' not in line and '\\"projections\\"' not in line: continue
                try: d = json.loads(line)
                except Exception: continue
                c = d.get('message', {}).get('content')
                if not isinstance(c, list): continue
                for blk in c:
                    if blk.get('type') != 'tool_result': continue
                    t = blk['content']; t = ''.join(z.get('text', '') for z in t) if isinstance(t, list) else t
                    yield mt, t
        else:
            yield mt, open(f, errors='ignore').read()

def parse(t):
    for cand in (t,):
        try: j = json.loads(cand)
        except Exception:
            try: j = json.loads(json.loads(cand)[0]['text'])
            except Exception: return None
        return j if isinstance(j, dict) and 'projections' in j else None

def main():
    index_path, out = sys.argv[1], sys.argv[2]
    day = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
    best = {}
    for mt, t in candidates():
        j = parse(t)
        if not j or j.get('type') != 'ros' or j.get('position') not in LIMIT: continue
        if j.get('data_as_of', {}).get('date') != day: continue
        p = j['position']
        if len(j['projections']) < min(LIMIT[p], int(j.get('count', 0) or 0)): continue
        if p not in best or mt > best[p][0]: best[p] = (mt, j)
    missing = [p for p in LIMIT if p not in best]
    if missing: sys.exit(f'missing FantasyPros pulls for {missing} dated {day}')
    old = live_rows(index_path)
    sos = {(r['pos'], r['team']): r['sos'] for r in old}
    rows = []
    for p in ['QB', 'RB', 'WR', 'TE']:
        f = 'points' if p == 'QB' else 'points_half'
        for x in best[p][1]['projections'][:LIMIT[p]]:
            rows.append({'pos': p, 'name': x['name'], 'team': x['team'], 'tot': round(x['stats'][f], 2),
                         'sos': sos.get((p, x['team']), 3.0)})
    names = {r['name'] for r in rows}
    rows += [r for r in old if r['pos'] in ('K', 'DST')]
    rows += [r for r in old if r['pos'] == 'QB' and r['tot'] == 0 and r['name'] not in names]
    json.dump(rows, open(out, 'w'))
    print('FantasyPros week', best['QB'][1].get('week'), 'as of', day, '->', len(rows), 'rows',
          dict(collections.Counter(r['pos'] for r in rows)))

if __name__ == '__main__':
    main()
