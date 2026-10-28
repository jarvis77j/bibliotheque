#!/usr/bin/env python3
"""Prix (et format) des livres de data/sorties.json.

Le prix se lit sur la fiche du livre (chez le libraire ou chez l'éditeur). Les fiches sont relues par petits lots à chaque
passage du robot, les sorties les plus proches d'aujourd'hui d'abord ; ce qui est trouvé est gardé dans data/prix.json
(clé = identifiant du livre) pour ne pas être relu et pour survivre aux reconstructions de sorties.json.
Sites : mêmes règles que le reste du robot (robots.txt respecté, une page à la fois, pause entre deux pages)."""
import html, json, os, re, sys, time
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import editeurs

DATA, CACHE = "data/sorties.json", "data/prix.json"
PAR_TOUR = int(os.environ.get("PRIX_FICHES", "250"))
# sources dont les fiches ne donnent pas de prix lisible (ou sont fermées aux robots)
SANS = ("bdgest", "nautiljon", "manganews", "michellafon", "dupuis", "casterman", "google")

PRIX = [  # (motif, groupe) du plus sûr au moins sûr
    r'"@type":\s*"Offer",\s*"price":\s*"(\d+(?:\.\d+)?)"',
    r'itemprop="price"[^>]*content="(\d+(?:\.\d+)?)"',
    r'<meta[^>]+itemprop="price"[^>]+content="(\d+(?:\.\d+)?)"',
    r'BookEditions-price">\s*(\d+[.,]\d{2})',
    r'livre-detail__right__bottom__infos__content">\s*(\d+[.,]\d{2})',
    r'info-content">\s*(\d+[.,]\d{2})\s*(?:&euro;|€)',
    r'Acheter en papier\s*/\s*(\d+[.,]\d{2})',
    r'data-field="Price"[^>]*>\s*(\d+[.,]\d{2})',
    r'class="price">\s*(\d+[.,]\d{2})',
    r'u-w--bold">\s*(\d+[.,]\d{2})(?:&nbsp;|\s)*€',
    r'Version papier</h3>.{0,200}?(\d+[.,]\d{2})\s*(?:&euro;|€)',
    r'Prix\s*:\s*(\d+[.,]\d{2})\s*(?:&euro;|€)',
]
FORMATS = [("poche", "Poche"), ("broch", "Broché"), ("reli", "Relié"), ("cartonn", "Relié")]


def prix_de(page):
    """Prix en euros (nombre) lu sur une fiche, ou 0."""
    q = html.unescape(page)
    for pat in PRIX:
        m = re.search(pat, q, re.S)
        if m:
            v = float(m.group(1).replace(",", "."))
            if 0.5 <= v <= 300: return round(v, 2)
    return 0


def format_de(page, b):
    """« Poche », « Broché » ou « Relié » si la fiche le dit clairement (sinon vide)."""
    q = html.unescape(page)
    m = re.search(r"\b(Poche|Broch[ée]e?|Reli[ée]e?|Cartonn[ée]e?)\s*:\s*\d+[.,]\d{2}", q)
    if m: return norm_format(m.group(1))
    if b.get("source", "").endswith("points"): return "Poche"
    return ""


def norm_format(f):
    """Format d'un site → Poche / Broché / Relié (ou le texte tel quel s'il est autre : « Grand format - Autre » → vide)."""
    s = (f or "").lower()
    for k, v in FORMATS:
        if k in s: return v
    return ""


def serie(b):
    """Titre de la série sans le numéro de tome : « One Piece - Tome 107 » → « one piece »."""
    t = re.split(r"\s+[-–:]\s*(?:tome|t\.?|vol\.?|volume)\s*\d+|\s+(?:tome|t|vol\.?|volume)\s*\d+|\s+\d+\s*$", editeurs.norm(b["title"]), maxsplit=1)[0]
    return t.strip()


def propager_auteurs(books):
    """Livres sans auteur (surtout les mangas de Nautiljon, qui ne les donne pas) : on prend celui des autres tomes de
    la même série chez le même éditeur, seulement s'il n'y en a qu'un seul."""
    par = {}
    for b in books:
        if b.get("authors"): par.setdefault((serie(b), editeurs.norm(b.get("publisher", ""))), set()).add(tuple(b["authors"]))
    n = 0
    for b in books:
        if b.get("authors") or not b.get("title"): continue
        c = par.get((serie(b), editeurs.norm(b.get("publisher", ""))))
        if c and len(c) == 1 and len(serie(b)) >= 4: b["authors"] = list(next(iter(c))); b["auteur_deduit"] = 1; n += 1
    return n


def main():
    d = json.load(open(DATA, encoding="utf-8"))
    books = d["books"]
    try: cache = json.load(open(CACHE, encoding="utf-8"))
    except Exception: cache = {}
    # 1. report du cache sur les livres
    for b in books:
        c = cache.get(b["id"])
        if c:
            if c.get("prix") and not b.get("prix"): b["prix"] = c["prix"]
            if c.get("format") and not norm_format(b.get("format")): b["format"] = c["format"]
    deduits = propager_auteurs(books)
    # 2. fiches à lire : sans prix, les plus proches d'aujourd'hui d'abord
    today = date.today()
    def near(b):
        try: return abs((date.fromisoformat(b["date"]) - today).days)
        except Exception: return 9999
    todo = [b for b in books if not b.get("prix") and b.get("url") and b["id"] not in cache
            and b.get("source", "libraire").split(":")[-1] not in SANS and near(b) <= 90]
    todo.sort(key=near)
    f = editeurs.Fetcher(1.0)
    fin = time.time() + 20 * 60
    lus = trouves = 0
    for b in todo[:PAR_TOUR]:
        if time.time() > fin: break
        page = f.get(b["url"], "prix-" + re.sub(r"\W", "", b["id"]))
        lus += 1
        if not page: continue
        p = prix_de(page)
        c = {"prix": p, "format": format_de(page, b), "le": today.isoformat()}
        cache[b["id"]] = c
        if p: b["prix"] = p; trouves += 1
        if c["format"] and not norm_format(b.get("format")): b["format"] = c["format"]
    # format des livres déjà connus : un seul mot (Poche / Broché / Relié) quand on peut
    st = d.setdefault("stats", {})
    st["prix"] = {"lus": lus, "trouves": trouves, "avec_prix": sum(1 for b in books if b.get("prix")),
                  "reste": max(0, len(todo) - lus), "total": len(books), "auteurs_deduits": deduits}
    json.dump(d, open(DATA, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("prix :", st["prix"])


if __name__ == "__main__":
    main()
