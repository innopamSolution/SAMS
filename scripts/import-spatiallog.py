#!/usr/bin/env python3
"""Spatial Log 엑셀(+ 외장하드 폴더) → sams/public/data/spatiallog.json

사용법:  python3 -I scripts/import-spatiallog.py "/Volumes/Innopam_AI/Spatial Log" ["엑셀 경로"]   (엑셀 경로를 생략하면 폴더 안의 엑셀을 쓴다)
엑셀 '[Spatial Log] K-성수 아카이브 프로젝트.xlsx' 의 '아이템 Item'·'프로젝트 Project' 시트에서
사이트(+폴리곤), 시기, 이벤트, 어노테이션, 공간 데이터 아이템(자산 목록)을 읽어 앱이 쓰는 JSON 으로 만든다.
3D 타일은 폴더의 03_Tiled3DMesh 안 zip 을 sams/.data-cache/tiles/<zip 이름>/ 로 풀어 두었을 때만 'tilesetUrl' 이 채워진다.
"""
import datetime as dt
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/Volumes/Innopam_AI/Spatial Log'
XLSX = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, '[Spatial Log] K-성수 아카이브 프로젝트.xlsx')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'data', 'spatiallog.json')
CACHE = os.path.join(HERE, '..', '.data-cache', 'tiles')

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def read_sheets(path):
    z = zipfile.ZipFile(path)
    ss = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

    def col(ref):
        n = 0
        for c in re.match(r'[A-Z]+', ref).group(0):
            n = n * 26 + ord(c) - 64
        return n - 1

    out = {}
    for sh in wb.find('m:sheets', NS):
        t = rels[sh.get('{%s}id' % NS['r'])]
        x = ET.fromstring(z.read('xl/' + t.lstrip('/').replace('xl/', '')))
        rows = {}
        for row in x.iter('{%s}row' % NS['m']):
            r = {}
            for c in row.findall('m:c', NS):
                v = c.find('m:v', NS)
                ty = c.get('t')
                if ty == 'inlineStr':
                    val = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
                elif v is None:
                    continue
                elif ty == 's':
                    val = ss[int(v.text)]
                else:
                    val = v.text
                if val != '':
                    r[col(c.get('r'))] = val
            if r:
                rows[int(row.get('r'))] = r
        out[sh.get('name')] = rows
    return out


def to_date(v):
    """엑셀 일련번호('46165.0') 또는 '2025.9.15'·'2024. 9. 11'·'2023.09.' 같은 글자 → 'YYYY-MM-DD'(일이 없으면 01)."""
    if v is None:
        return None
    s = str(v).strip()
    if re.fullmatch(r'\d+(\.\d+)?', s) and float(s) > 20000:
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(float(s)))).isoformat()
    m = re.match(r'(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?', s)
    if m:
        return '%04d-%02d-%02d' % (int(m.group(1)), int(m.group(2)), int(m.group(3) or 1))
    return None


def month_end(d):
    y, m = int(d[:4]), int(d[5:7])
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def norm(s):
    return re.sub(r'\s+', '', s or '')


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


sheets = read_sheets(XLSX)
item_rows = next(v for k, v in sheets.items() if k.startswith('아이템'))
proj_rows = next(v for k, v in sheets.items() if k.startswith('프로젝트'))


def section(label):
    """프로젝트 시트에서 첫 칸(또는 둘째 칸)이 label 인 머리글 행 번호."""
    for n, r in sorted(proj_rows.items()):
        if r.get(0) == label and (label != '프로젝트' or r.get(1) == '프로젝트 명'):
            return n
    raise SystemExit('프로젝트 시트에서 "%s" 표를 찾지 못했습니다' % label)


def rows_after(label, stop_labels):
    start = section(label)
    out = []
    for n in sorted(proj_rows):
        if n <= start:
            continue
        r = proj_rows[n]
        if r.get(0) in stop_labels:
            break
        out.append((n, r))
    return out


STOPS = {'프로젝트', '사이트', '시기', '이벤트', '어노테이션'}

# ── 프로젝트·사이트(폴리곤)·시기·이벤트·어노테이션 ─────────────────────
prj = rows_after('프로젝트', STOPS)[0][1]
project = {'name': prj.get(1, ''), 'start': to_date(prj.get(5))}

geo = None
for n, r in rows_after('사이트', STOPS):
    if 7 in r and r[7].lstrip().startswith('{'):
        geo = json.loads(r[7])
polys = {}
for f in (geo or {'features': []})['features']:
    ring = f['geometry']['coordinates'][0] if f['geometry']['type'] == 'Polygon' else f['geometry']['coordinates'][0][0]
    polys[norm(f['properties']['site_kr'])] = {'name': f['properties']['site_kr'], 'nameEn': f['properties'].get('site_en', ''), 'polygon': ring}

sites = []
for n, r in rows_after('사이트', STOPS):
    if 1 not in r or not re.fullmatch(r'\d+(\.\d+)?', str(r.get(0, ''))):
        continue
    key = norm(r[1])
    p = polys.get(key, {})
    ring = p.get('polygon')
    ctr = None
    if ring:
        pts = ring[:-1] if ring[0] == ring[-1] else ring
        ctr = [sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts)]
    sites.append({'key': key, 'name': p.get('name') or r[1], 'nameEn': p.get('nameEn', ''), 'polygon': ring, 'center': ctr})
site_by_key = {s['key']: s for s in sites}


def site_key_of(raw):
    """이벤트 표의 사이트명('펍지 성수', '역삼 오피스 인테리어' …)을 사이트 표의 키로 맞춘다."""
    k = norm(raw)
    if k in site_by_key:
        return k
    for sk in sorted(site_by_key, key=len, reverse=True):
        if k.startswith(sk) or sk.startswith(k):
            return sk
    return k


periods = []
for n, r in rows_after('시기', STOPS):
    if 1 in r:
        s_, e_ = to_date(r.get(5)), to_date(r.get(6))
        periods.append({'name': r[1], 'start': s_, 'end': month_end(e_) if e_ else None})

events = []
cur_site = ''
for n, r in rows_after('이벤트', STOPS):
    if 1 in r:
        cur_site = r[1]
    if 3 in r:  # 이벤트 제목이 있는 것만
        events.append({'site': site_key_of(cur_site), 'title': r[3], 'date': to_date(r.get(4) or r.get(5)), 'end': to_date(r.get(6)), 'desc': r.get(7, ''), 'keyword': r.get(8, '')})

annotations = []
for n, r in rows_after('어노테이션', STOPS):
    if 3 in r:
        annotations.append({'placeTo': r.get(1, ''), 'site': norm(r.get(2, '')), 'title': r[3], 'type': r.get(7, ''), 'content': r.get(8, ''), 'tags': [t.strip() for t in re.split(r'[,，]', r.get(9, '')) if t.strip()]})

# ── 공간 데이터 아이템 ───────────────────────────────────────────────
# 열: 0 전달상태 · 1 번호 · 2 공간명 · 3 아이템명 · 4 데이터 형식 · 5 세부 내용 · 6 datetime · 7 start · 8 end · 9 취득방식 · 10 파일 형식 · 11 파일 경로 · 12 구분 · 13 비고
def asset_of(r):
    path = (r.get(11) or '').replace('\\', '/').strip()
    a = {
        'detail': r.get(5, ''), 'method': r.get(9, ''), 'format': r.get(4, ''), 'fileType': r.get(10, ''),
        'path': path if path != '-' else '', 'kind': r.get(12, ''), 'name': '', 'gb': None, 'count': None, 'note': r.get(13, ''), 'extra': '',
    }
    a['available'] = False
    return a


groups = {}
order = []
for n in sorted(item_rows):
    if n < 4:
        continue
    r = item_rows[n]
    if 2 not in r or 3 not in r:
        continue
    key = (norm(r[2]), r[3])
    if key not in groups:
        groups[key] = {'siteKey': norm(r[2]), 'siteRaw': r[2], 'title': r[3], 'date': to_date(r.get(6)), 'start': to_date(r.get(7)), 'end': to_date(r.get(8)), 'assets': [], 'delivery': r.get(0, '')}
        order.append(key)
    g = groups[key]
    g['date'] = g['date'] or to_date(r.get(6))
    g['assets'].append(asset_of(r))

for g in groups.values():
    for a in g['assets']:
        if '타일드' in a['detail'] and a['path']:
            folder = os.path.join(ROOT, a['path'].replace('/', os.sep))
            zips = sorted(f for f in os.listdir(folder) if f.lower().endswith('.zip')) if os.path.isdir(folder) else []
            # 폴더 안의 zip 중 이름의 연도가 아이템 연도와 같은 것만 인정한다(복사된 자리표시 경로 방지).
            zips = [z for z in zips if (g['date'] or '')[:4] == z[:4]]
            a['sourceExists'] = bool(zips)
            if zips:
                base = zips[0][:-4]
                a['name'] = base
                try:
                    a['gb'] = round(os.path.getsize(os.path.join(folder, zips[0])) / 2**30, 2)
                except OSError:
                    pass
                tj = os.path.join(CACHE, base, 'tileset.json')
                if os.path.exists(tj):
                    a['available'] = True
                    a['tileset'] = 'spatiallog/%s/tileset.json' % base
                    try:
                        props = json.load(open(tj, encoding='utf-8')).get('properties', {})
                        hmin = props.get('Height', {}).get('minimum')
                        a['groundH'] = round(hmin, 1) if hmin is not None else None
                    except Exception:
                        a['groundH'] = None
        elif a['path']:
            a['available'] = os.path.exists(os.path.join(ROOT, a['path'].replace('/', os.sep)))

items = []
for i, key in enumerate(order, 1):
    g = groups[key]
    site = site_by_key.get(g['siteKey'])
    det = ' '.join(a['detail'] + ' ' + a['format'] for a in g['assets'])
    cat = 'model3d' if '메시' in det else 'pointcloud' if '포인트' in det else 'pano' if '파노라마' in det else 'image' if ('사진' in det or '취득 데이터' in det) else 'document'
    items.append({
        'id': 'sl-%d' % i, 'site': g['siteKey'], 'siteName': site['name'] if site else g['siteRaw'], 'title': g['title'], 'date': g['date'],
        'start': g['start'], 'end': g['end'], 'cat': cat, 'assets': g['assets'], 'delivery': g['delivery'],
    })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({'project': project, 'sites': sites, 'periods': periods, 'events': events, 'annotations': annotations, 'items': items}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('sites', len(sites), 'periods', len(periods), 'events', len(events), 'annotations', len(annotations), 'items', len(items))
print('3D available:', [(it['siteName'], it['title']) for it in items if any(a.get('tileset') for a in it['assets'])])
