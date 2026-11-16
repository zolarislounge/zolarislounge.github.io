#!/usr/bin/env python3
"""Snapshot of the shop for a fast first load from Iran.

Writes assets/snap/data.json (visible products, categories, announcement) and copies
each product's small card image into assets/snap/, so the first screen comes from the
site itself (cached by the Iranian CDN) instead of the database server abroad.
Run by .github/workflows/snapshot.yml; safe to run locally too.
"""
import hashlib, json, os, re, urllib.request

URL = 'https://avwgfmdnwibtxurlnphw.supabase.co'
KEY = 'sb_publishable_VOh9R0tdxf-3YFN9_y3J1Q_mf9kIXf2'   # public (publishable) key, same as in the site
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'snap')
PROD_RE = re.compile(r'/storage/v1/object/public/image/products/[^/?#]+\.(jpe?g|png|webp)$', re.I)


def get(path):
    req = urllib.request.Request(URL + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.read()
    except Exception:
        return None


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in json.loads(get('/rest/v1/products?select=*&order=created_at.desc')) if not r.get('hidden')]
    sets = json.loads(get('/rest/v1/site_settings?select=key,value&key=in.(categories,announce)'))
    imgs, keep = {}, {'data.json'}
    for r in rows:
        urls = [r.get('image_url')] + list((r.get('images') or [])[:2])
        for u in dict.fromkeys(u for u in urls if u):
            name = hashlib.sha1(u.encode()).hexdigest()[:16] + '.jpg'
            dest = os.path.join(OUT, name)
            if not os.path.exists(dest):
                data = None
                for src in ([u + '.t.jpg'] if PROD_RE.search(u) else []) + [u]:
                    data = fetch(src)
                    if data:
                        break
                if not data:
                    continue
                with open(dest, 'wb') as f:
                    f.write(data)
            keep.add(name)
            imgs[u] = 'assets/snap/' + name
    for f in os.listdir(OUT):
        if f not in keep:
            os.remove(os.path.join(OUT, f))
    new = json.dumps({'rows': rows, 'sets': sets, 'imgs': imgs}, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    path = os.path.join(OUT, 'data.json')
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if old != new:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new)
    print(f'{len(rows)} products, {len(imgs)} images')


if __name__ == '__main__':
    main()
