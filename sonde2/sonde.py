import urllib.request, urllib.robotparser, urllib.parse, time, os, json, gzip, sys
UA = "Mozilla/5.0 (compatible; MaBibliothequeBot/1.0; +https://jarvis77j.github.io/bibliotheque/)"
PAGES = {
 "gallimard": ["https://www.gallimard.fr/", "https://www.gallimard.fr/A-paraitre"],
 "flammarion": ["https://editions.flammarion.com/index.php/Catalogue/(parution)/a-paraitre"],
 "jailu": ["https://www.jailu.com/"],
 "casterman": ["https://www.casterman.com/"],
 "lisez": ["https://www.lisez.com/a-paraitre", "https://www.lisez.com/nouveautes"],
 "pocket": ["https://www.pocket.fr/"],
 "harpercollins": ["https://www.harpercollins.fr/collections/a-paraitre", "https://www.harpercollins.fr/collections/a-paraitre?page=2"],
 "actessud": ["https://actes-sud.fr/catalogue?page=1", "https://actes-sud.fr/"],
 "edl": ["https://www.ecoledesloisirs.fr/catalogue/nouveautes/Nov/2026", "https://www.ecoledesloisirs.fr/catalogue/nouveautes/Oct/2026?page=1"],
 "albinmichel": ["https://www.albin-michel.fr/a-paraitre", "https://www.albin-michel.fr/nouveautes"],
 "michellafon": ["https://www.michel-lafon.fr/nos-livres?3049e819_page=1", "https://www.michel-lafon.fr/"],
 "bragelonne": ["https://www.bragelonne.fr/a-paraitre/?page=1", "https://www.bragelonne.fr/a-paraitre/?page=2"],
 "hugo": ["https://www.hugopublishing.fr/a-paraitre/?paged=1"],
 "points": ["https://www.editionspoints.com/nouveautes"],
 "manganews": ["https://www.manga-news.com/index.php/planning?p_year=2026&p_month=11&p_editor=", "https://www.manga-news.com/index.php/planning?p_year=2027&p_month=3&p_editor=&page=2"],
 "bdgest": ["https://www.bdgest.com/sorties_bd", "https://www.bdgest.com/sorties_manga", "https://www.bdgest.com/sorties_comics", "https://www.bdgest.com/sorties_bd?DL=12%2F2026"],
 "bedetheque": [],
 "dargaud": ["https://www.dargaud.com/bd-a-paraitre", "https://www.dargaud.com/bd-a-paraitre/12-2026"],
 "kana": ["https://www.kana.fr/planning/?month_nb=12&year_nb=2026"],
 "delcourt": ["https://www.editions-delcourt.fr/bd/a-paraitre-bandes-dessinees", "https://www.editions-delcourt.fr/mangas/a-paraitre-mangas"],
 "soleil": ["https://www.editions-soleil.fr/bd/a-paraitre-bandes-dessinees"],
 "dupuis": ["https://www.dupuis.com/catalogue/FR/parutions.html"],
 "lombard": ["https://www.lelombard.com/bd/nouveautes"],
 "fleurus": ["https://www.fleuruseditions.com/nouveautes-fleurus.html"],
 "ruedesevres": ["https://www.editions-ruedesevres.fr/"],
 "bayard": ["https://www.bayard-editions.com/"],
 "milan": ["https://www.editionsmilan.com/"],
 "nautiljon": ["https://www.nautiljon.com/planning/manga/"],
 "kioon": ["https://ki-oon.com/planning"],
 "rageot": ["https://www.rageot.fr/a-paraitre/"],
}
ROOTS = {"gallimard":"https://www.gallimard.fr","flammarion":"https://editions.flammarion.com","jailu":"https://www.jailu.com","casterman":"https://www.casterman.com","lisez":"https://www.lisez.com","pocket":"https://www.pocket.fr","harpercollins":"https://www.harpercollins.fr","actessud":"https://actes-sud.fr","edl":"https://www.ecoledesloisirs.fr","albinmichel":"https://www.albin-michel.fr","michellafon":"https://www.michel-lafon.fr","bragelonne":"https://www.bragelonne.fr","hugo":"https://www.hugopublishing.fr","points":"https://www.editionspoints.com","manganews":"https://www.manga-news.com","bdgest":"https://www.bdgest.com","bedetheque":"https://www.bedetheque.com","dargaud":"https://www.dargaud.com","kana":"https://www.kana.fr","delcourt":"https://www.editions-delcourt.fr","soleil":"https://www.editions-soleil.fr","dupuis":"https://www.dupuis.com","lombard":"https://www.lelombard.com","fleurus":"https://www.fleuruseditions.com","ruedesevres":"https://www.editions-ruedesevres.fr","bayard":"https://www.bayard-editions.com","milan":"https://www.editionsmilan.com","nautiljon":"https://www.nautiljon.com","kioon":"https://ki-oon.com","rageot":"https://www.rageot.fr"}
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr", "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = r.read()
            if r.headers.get("Content-Encoding") == "gzip": d = gzip.decompress(d)
            return r.status, d.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try: body = e.read().decode("utf-8", "replace")
        except Exception: body = ""
        return e.code, body
    except Exception as e:
        return -1, str(e)
os.makedirs("sonde2/html", exist_ok=True)
rep = {}
for k, root in ROOTS.items():
    st, txt = get(root + "/robots.txt"); time.sleep(2)
    open(f"sonde2/html/robots-{k}.txt", "w").write(txt[:20000])
    rp = urllib.robotparser.RobotFileParser(); rp.parse(txt.splitlines() if st == 200 else [])
    rep[k] = {"robots": st, "pages": []}
    for i, u in enumerate(PAGES.get(k, [])):
        ok = rp.can_fetch(UA, u) if st == 200 else (st in (404, 410))
        if not ok:
            rep[k]["pages"].append({"url": u, "allowed": False}); continue
        s, t = get(u); time.sleep(3)
        open(f"sonde2/html/{k}-{i}.html", "w").write(t)
        rep[k]["pages"].append({"url": u, "allowed": True, "status": s, "len": len(t), "challenge": any(x in t for x in ("Just a moment", "Request Rejected", "cf-chl", "captcha"))})
    print(k, json.dumps(rep[k]), flush=True)
json.dump(rep, open("sonde2/rapport.json", "w"), indent=1)
