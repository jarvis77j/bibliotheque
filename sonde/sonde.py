# Sonde générique : lit sonde/urls.txt (lignes « nom URL »), respecte robots.txt, enregistre sonde/out/<nom>.html
import os, sys, time, json
sys.path.insert(0, "scripts"); import editeurs
f = editeurs.Fetcher(3.0); rep = {}
os.makedirs("sonde/out", exist_ok=True)
for line in open("sonde/urls.txt"):
    if not line.strip() or line.startswith("#"): continue
    name, url = line.split(None, 1); url = url.strip()
    ok = f.allowed(url); e0 = f.errors
    t = f.get(url, name) if ok else ""
    open(f"sonde/out/{name}.html", "w").write(t)
    rep[name] = {"url": url, "robots_ok": ok, "len": len(t), "erreur": f.errors > e0}
    print(name, rep[name], flush=True)
json.dump(rep, open("sonde/out/rapport.json", "w"), indent=1)
