"""ดึงข้อมูลเขื่อนจาก API กรมชลประทาน → data/dam-api.json (ใช้โดย GitHub Actions)"""
import json, sys, time, urllib.request

URL = 'https://bigdata-swoc.rid.go.th/api/ma/reservoir/get_dam_data?date=&basin=&province=&region=&rid='
KEEP = ['name', 'latitude', 'longitude', 'dam_capacity', 'dam_storage', 'dam_volume', 'dam_percent_storage',
        'dam_inflow', 'dam_outflow', 'date']
OUT = 'data/dam-api.json'

def fetch():
    req = urllib.request.Request(URL, headers={'User-Agent': 'onwr-map (github actions)'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print('attempt', attempt + 1, 'failed:', e, file=sys.stderr)
            time.sleep(15 * (attempt + 1))
    raise SystemExit('fetch failed')

raw = fetch()
rows = raw.get('data') or []
if not raw.get('success') or not rows:
    raise SystemExit('API returned no data — keep previous file')
data = [{k: d.get(k) for k in KEEP} for d in rows]
data.sort(key=lambda d: d['name'] or '')
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'source': URL, 'data': data}, f, ensure_ascii=False, indent=0)
print(len(data), 'dams written to', OUT)
