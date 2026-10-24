#!/usr/bin/env python3
"""Meilleures ventes des librairies indépendantes (leslibraires.fr, pages /dossiers/ « Meilleures ventes »).

Une fois par jour : on relève le classement de chaque rayon et on le garde. « Top de la semaine » = classements des
7 derniers jours cumulés (21 - rang points par jour) ; « Top du mois » = ceux du mois en cours.
Écrit data/ventes.json (lu par l'app) et data/ventes-historique.json (classements des 62 derniers jours + fiches).

Même règles que sorties.py : pages /dossiers/ et /livre/ autorisées, 5 secondes entre deux pages.
Usage : python3 scripts/ventes.py   (VENTES=1 pour forcer un nouveau relevé le même jour)"""
import json, os, re, sys, time
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sorties as S  # get(), parse_book(), kind_of(), list_links()

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUT, HIST = os.path.join(DATA, "ventes.json"), os.path.join(DATA, "ventes-historique.json")
# rayon -> (dossier « Meilleures ventes », nombre de pages de 12 lues)
LISTS = {
    "tous": ("/dossiers/meilleures-ventes-a-25-821431/", 2),
    "roman": ("/dossiers/meilleures-ventes-a-25-113534/", 2),
    "policier": ("/dossiers/meilleures-ventes-a-25-821433/", 2),
    "fantasy": ("/dossiers/meilleures-ventes-a-25-821434/", 2),
    "romance": ("/dossiers/meilleures-ventes-a-25-821432/", 2),
    "bd": ("/dossiers/meilleures-ventes-a-25-113870/", 8),   # BD, comics et mangas : séparés ensuite
    "jeunesse": ("/dossiers/meilleures-ventes-a-25-113821/", 2),
}
# page du rayon : si le dossier ci-dessus ne donne rien, on y cherche le lien « Meilleures ventes » (comme sorties.py pour les nouveautés)
RAYON_PAGES = {
    "roman": "/boutique/25/livres-papier/113534/litterature-generale", "policier": "/boutique/25/livres-papier/821433/policier-thriller",
    "fantasy": "/boutique/25/livres-papier/821434/science-fiction-fantastique-fantasy", "romance": "/boutique/25/livres-papier/821432/romance",
    "bd": "/boutique/25/livres-papier/113870/bd-comics-mangas", "jeunesse": "/boutique/25/livres-papier/113821/jeunesse",
    "tous": "/boutique/25/livres-papier/",
}
OUTPUT_LISTS = ["tous", "roman", "policier", "fantasy", "romance", "manga", "bd", "jeunesse"]
TOP = 10          # livres gardés par liste
POINTS = 21       # le 1er gagne 20 points, le 20e un point
FICHES_MAX = 90   # fiches lues au plus par passage (5 s chacune)
# éditeurs de manga : un livre de la liste BD/manga chez l'un d'eux est classé en manga sans lire sa fiche
MANGA_PUBS = ("kana", "glenat manga", "pika", "kurokawa", "ki oon", "kioon", "kaze", "tonkam", "akata", "meian", "nobi nobi", "crunchyroll",
              "mangetsu", "doki doki", "panini manga", "soleil manga", "delcourt tonkam", "ototo", "taifu", "vega", "hikari", "noeve grafx",
              "isan manga", "mana books", "bamboo manga", "michel lafon manga", "kbooks", "kotoon", "komikku", "lumen", "mangas")


def cards(page):
    """[(chemin /livre/…, titre, auteur, éditeur)] d'une page de classement, dans l'ordre."""
    out = []
    for blk in re.findall(r'<article class="card-product">.*?</article>', page, re.S):
        m = re.search(r'<a href="(/livre/[^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not m: continue
        au = re.search(r'itemprop="author">\s*([^<]+?)\s*<', blk)
        ed = re.search(r'itemprop="publisher">\s*([^<]+?)\s*<', blk)
        out.append((m.group(1), S.text(m.group(2)), S.html.unescape(au.group(1)) if au else "", S.html.unescape(ed.group(1)) if ed else ""))
    return out


def find_dossier(name):
    """Lien « Meilleures ventes » lu sur la page du rayon (identifiants non garantis : le site peut les changer)."""
    page = S.get(RAYON_PAGES.get(name, ""))
    m = re.search(r'href="(/dossiers/meilleures-ventes[^"]*)"', page or "")
    return m.group(1) if m else ""


def is_manga(b):
    """Rayon « BD, Comics & Manga » > « Manga » (les mangas sont rangés à part des bandes dessinées), ou éditeur de manga."""
    r = b.get("rayons", [])
    if len(r) > 1 and r[1].lower().startswith("manga"): return True
    pub = re.sub(r"[^a-z0-9]+", " ", (b.get("publisher") or "").lower().replace("é", "e")).strip()
    return bool(pub) and any(pub == m or pub.startswith(m + " ") for m in MANGA_PUBS)


def read_rankings(paths, diag):
    """Lit les classements du jour. Renvoie {liste: [identifiants]} et remplit paths {id: (lien, titre, auteur, éditeur)}."""
    snap = {}
    for name, (path, pages) in LISTS.items():
        rows = []
        for essai in (0, 1):
            rows = []
            for p in range(1, pages + 1):
                page = S.get(path + (f"?page={p}" if p > 1 else ""))
                rows += cards(page) if page else []
                if not page: break
            if len(rows) >= 6 or essai: break
            alt = find_dossier(name)  # l'identifiant prévu ne marche pas : on cherche le bon sur la page du rayon
            if not alt or alt == path: break
            print("  dossier de remplacement pour", name, ":", alt, file=sys.stderr); path = alt
        diag[name] = {"dossier": path, "lignes": len(rows)}
        if len(rows) < 6:  # page vide ou changée : on ne garde pas un classement bancal
            print("  classement incomplet :", name, len(rows), file=sys.stderr); continue
        ids = []
        for href, title, author, pub in rows:
            if re.match(r"H_", title): continue  # fiche promotionnelle (« H_Bernard Minier Nouveauté poche… »), pas un titre
            bid = "ll:" + href.split("/")[2].split("-")[0]
            ids.append(bid); paths[bid] = (href, title, author, pub)
        snap[name] = ids
    return snap


def main():
    today = date.today().isoformat()
    try: hist = json.load(open(HIST, encoding="utf-8"))
    except Exception: hist = {"snaps": {}, "books": {}}
    forced = os.environ.get("VENTES") == "1"
    # classements du jour : déjà lus et complets (sinon, au plus 3 relevés par jour) → on ne les relit pas, on complète seulement les fiches
    essais = hist.get("essais", {})
    fait = set(OUTPUT_LISTS) <= set(hist["snaps"].get(today, {})) or essais.get(today, 0) >= 3
    try: known = {b["id"]: b for b in json.load(open(os.path.join(DATA, "sorties.json"), encoding="utf-8"))["books"]}
    except Exception: known = {}
    paths, diag, resplit = {}, {}, False
    if fait and not forced:
        snap = {k: list(v) for k, v in hist["snaps"].get(today, {}).items()}
        try: diag = json.load(open(OUT, encoding="utf-8")).get("diagnostic", {})
        except Exception: diag = {}
        for bid, b in hist["books"].items():
            paths[bid] = (b.get("url", "").replace(S.BASE, ""), b.get("title", ""), (b.get("authors") or [""])[0], b.get("publisher", ""))
    else:
        snap = read_rankings(paths, diag); resplit = True
    if not snap:
        print("aucun classement lu", file=sys.stderr); sys.exit(1)
    # fiches : les livres bien classés dont on n'a pas la fiche (ou dont la lecture a échoué), un rang après l'autre dans chaque liste
    need = []
    for rang in range(30):
        for name, ids in snap.items():
            if rang >= (30 if name == "bd" else 14) or rang >= len(ids): continue
            bid = ids[rang]
            h = hist["books"].get(bid)
            if (not h or not h.get("lu")) and bid not in need: need.append(bid)
    read = 0
    for bid in need:
        href, title, author, pub = paths[bid]
        b = known.get(bid)
        lu = bool(b)
        if not b and read < FICHES_MAX:
            page = S.get(href); read += 1
            if page:
                try: b = S.parse_book(href, page); lu = bool(b)
                except Exception as e: print("  fiche illisible", href, e, file=sys.stderr)
        if not b:
            if bid in hist["books"]: continue  # une lecture ratée ne remplace pas ce qu'on a déjà
            b = {"id": bid, "title": title, "authors": [author] if author else [], "publisher": pub, "isbn": "", "cover": "", "rayons": [], "url": S.BASE + href}
        hist["books"][bid] = {k: (b.get(k) or "") for k in ("id", "title", "publisher", "isbn", "cover", "url", "date")}
        hist["books"][bid]["authors"] = b.get("authors", [])
        hist["books"][bid]["manga"] = is_manga(b)
        hist["books"][bid]["description"] = (b.get("description") or "")[:300]
        hist["books"][bid]["lu"] = lu
    if resplit:  # la liste BD est coupée en manga / BD
        bd = snap.pop("bd", [])
        snap["manga"] = [i for i in bd if hist["books"].get(i, {}).get("manga")]
        snap["bd"] = [i for i in bd if i in hist["books"] and not hist["books"][i].get("manga")]
        hist["essais"] = {today: essais.get(today, 0) + 1}
    hist["snaps"][today] = snap
    cut = (date.today() - timedelta(days=62)).isoformat()
    hist["snaps"] = {d: v for d, v in hist["snaps"].items() if d >= cut}
    used = {i for v in hist["snaps"].values() for ids in v.values() for i in ids}
    hist["books"] = {k: v for k, v in hist["books"].items() if k in used}

    def top(name, since):
        pts, best = {}, {}
        for d, v in hist["snaps"].items():
            if d < since: continue
            for r, bid in enumerate(v.get(name, [])[:POINTS - 1]):
                pts[bid] = pts.get(bid, 0) + POINTS - 1 - r
                best[bid] = min(best.get(bid, 99), r)
        order = sorted((i for i in pts if i in hist["books"]), key=lambda i: (-pts[i], best[i]))[:TOP]
        return [{**hist["books"][i], "rang": n + 1} for n, i in enumerate(order)]

    week_from = (date.today() - timedelta(days=6)).isoformat()
    month_from = today[:8] + "01"
    listes = {n: {"semaine": top(n, week_from), "mois": top(n, month_from)} for n in OUTPUT_LISTS}
    days = sorted(hist["snaps"])
    out = {"updated": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "source": "leslibraires.fr (librairies indépendantes)",
           "jours": len(days), "depuis": days[0] if days else "", "listes": listes, "diagnostic": diag}
    os.makedirs(DATA, exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(hist, open(HIST, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print({n: (len(l["semaine"]), len(l["mois"])) for n, l in listes.items()}, "fiches lues :", read, file=sys.stderr)


if __name__ == "__main__":
    main()
