import urllib.request, urllib.parse, json, os, time
KEY = "AIzaSyDOeFi3IlADcw-C6MdXdJpR9yzDAvEy5DA"
os.makedirs("sonde/out", exist_ok=True); rep = {}
for name, q, extra in [("k1", 'inpublisher:"Gallimard"', {}), ("k2", 'inpublisher:"Gallimard"', {"country": "FR"}),
                       ("k3", 'inpublisher:"Pocket"', {"country": "FR"}), ("k4", "inpublisher:Gallimard", {"country": "FR"}),
                       ("k5", 'inpublisher:"Gallimard"', {"country": "FR", "langRestrict": ""})]:
    p = {"q": q, "orderBy": "newest", "langRestrict": "fr", "printType": "books", "maxResults": 40, "key": KEY}; p.update(extra)
    p = {k: v for k, v in p.items() if v != ""}
    req = urllib.request.Request("https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode(p),
                                 headers={"Referer": "https://jarvis77j.github.io/bibliotheque/"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: body = r.read().decode(); st = r.status
    except urllib.error.HTTPError as e: body = e.read().decode(); st = e.code
    open(f"sonde/out/{name}.html", "w").write(body)
    try:
        d = json.loads(body); it = d.get("items", [])
        rep[name] = {"st": st, "total": d.get("totalItems"), "n": len(it), "ex": [(i["volumeInfo"].get("publishedDate"), i["volumeInfo"].get("publisher"), i["volumeInfo"].get("title", "")[:30]) for i in it[:8]], "err": d.get("error", {}).get("message")}
    except Exception as e: rep[name] = {"st": st, "body": body[:300]}
    time.sleep(2)
json.dump(rep, open("sonde/out/rapport.json", "w"), indent=1, ensure_ascii=False)
