#!/usr/bin/env python3
"""Récupère les sorties de livres sur leslibraires.fr (réseau de librairies indépendantes)
et les écrit dans data/sorties.json, lu par l'onglet « Sorties » de l'app.

Lancé par GitHub Actions plusieurs fois par jour. Respecte le robots.txt du site
(pages /dossiers/ et /livre/ autorisées, 5 secondes entre deux pages).
Les fiches déjà connues ne sont pas retéléchargées."""
import html, json, os, re, sys, time, urllib.request
from datetime import date, datetime, timedelta

BASE = "https://www.leslibraires.fr"
UA = "Mozilla/5.0 (compatible; MaBibliothequeBot/1.0; +https://jarvis77j.github.io/bibliotheque/)"
DELAY = 5
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "sorties.json")
MAX_NEW = int(os.environ.get("MAX_NEW", "350"))
# rayons à suivre : page du rayon (pour trouver son dossier « Nouveautés ») et genre dans l'app
RAYONS = [
    ("/boutique/25/livres-papier/821432/romance", "romance"),
    ("/boutique/25/livres-papier/821434/science-fiction-fantastique-fantasy", "fantasy"),
    ("/boutique/25/livres-papier/821433/policier-thriller", "policier"),
    ("/boutique/25/livres-papier/746338/litterature-jeunes-adultes", "ya"),
    ("/boutique/25/livres-papier/113870/bd-comics-mangas", "bd"),
    ("/boutique/25/livres-papier/113534/litterature-generale", "roman"),
]
MONTHS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split())}

_last = [0.0]
def get(path):
    wait = DELAY - (time.time() - _last[0])
    if wait > 0: time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print("  échec", path, e, file=sys.stderr)
        return ""

def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>\s*<p[^>]*>", "\n\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", s)).strip()

def list_links(page):
    """Liens /livre/… d'une page de liste (dossier)."""
    return list(dict.fromkeys(re.findall(r'class="card-product__title">\s*<a href="(/livre/[^"]+)"', page)))

def nouveautes_dossier(rayon_page):
    m = re.search(r'<h2 class="title--section">\s*<a href="(/dossiers/nouveautes[^"]*)">', rayon_page)
    return m.group(1) if m else ""

def fr_date(s):
    m = re.search(r"(\d{1,2})(?:er)? (\w+) (\d{4})", s or "")
    if not m or m.group(2).lower() not in MONTHS: return ""
    return f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"

def caract(page, label):
    """Valeur d'une ligne du tableau « Caractéristiques »."""
    m = re.search(r'<th scope="row">\s*' + label + r'\s*</th>\s*<td[^>]*>(.*?)</td>', page, re.S)
    return text(m.group(1)) if m else ""

def clean_title(t):
    # « Abysses\n\n 2 - Abysses - Tome 02 » : la série est répétée au-dessus, on garde la dernière ligne
    lines = [l.strip() for l in (t or "").splitlines() if l.strip()]
    t = lines[-1] if lines else ""
    # « 9 - Les Aigles de Rome - Tome 9 », « 1, Swan - Tome 1 » : le numéro devant est en trop
    return re.sub(r"^\d+(?:\.\d+)?\s*[-,]\s*", "", t)

def parse_book(path, page):
    title = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    desc = re.search(r'<p itemprop="description">(.*?)</p>\s*</div>', page, re.S)
    cover = re.search(r'itemprop="image" src="(//[^"]+)"', page)
    authors = re.findall(r'itemprop="author" class="link">\s*([^<]+?)\s*<', page) or re.findall(r'itemprop="author">\s*([^<]+?)\s*<', page)
    crumbs = []
    for c in re.findall(r'"@type": "ListItem", "position": \d+, "name": "((?:[^"\\]|\\.)*)"', page):
        try: crumbs.append(json.loads('"' + c + '"'))
        except ValueError: pass
    return {
        "id": "ll:" + path.split("/")[2].split("-")[0],
        "title": clean_title(text(title.group(1))) if title else "",
        "authors": list(dict.fromkeys(html.unescape(a).strip() for a in authors))[:3],
        "publisher": caract(page, "Éditeur"),
        "date": fr_date(caract(page, "Date de publication")),
        "isbn": caract(page, "EAN13"),
        "pages": int(caract(page, "Nombre de pages") or 0) if caract(page, "Nombre de pages").isdigit() else 0,
        "format": caract(page, "Format"),
        "cover": "https:" + cover.group(1) if cover else "",
        "description": text(desc.group(1))[:1500] if desc else "",
        "rayons": crumbs[2:6] if len(crumbs) > 2 else [],
        "url": BASE + path,
    }

def kind_of(book, hint):
    r = " ".join(book.get("rayons", [])).lower()
    for words, k in [(("bande", "manga", "comics", "bd "), "bd"), (("romance",), "romance"), (("jeunes adultes", "young"), "ya"),
                     (("fantasy", "fantastique", "science-fiction"), "fantasy"), (("policier", "thriller", "polar"), "policier"),
                     (("jeunesse",), "jeunesse"), (("roman", "littérature"), "roman")]:
        if any(w in r for w in words): return k
    return hint or ""

def main():
    try:
        old = {b["id"]: b for b in json.load(open(OUT, encoding="utf-8"))["books"]}
    except Exception:
        old = {}
    todo = {}  # chemin -> genre suggéré
    # précommandes : on va loin pour voir les sorties des 6 prochains mois
    for p in range(1, 31):
        links = list_links(get(f"/dossiers/precommandes/?page={p}"))
        if not links: break
        for l in links: todo.setdefault(l, "")
    for p in range(1, 9):
        for l in list_links(get(f"/dossiers/nouveautes/?page={p}")): todo.setdefault(l, "")
    for rayon, k in RAYONS:
        d = nouveautes_dossier(get(rayon))
        if not d: continue
        for p in range(1, 9):
            links = list_links(get(d + ("" if p == 1 else f"?page={p}")))
            if not links: break
            for l in links: todo[l] = k
    print(len(todo), "livres listés", file=sys.stderr)
    books, new = {}, 0
    for path, hint in todo.items():
        bid = "ll:" + path.split("/")[2].split("-")[0]
        b = old.get(bid)
        if not b:
            if new >= MAX_NEW: continue
            page = get(path); new += 1
            if not page: continue
            try: b = parse_book(path, page)
            except Exception as e:
                print("  fiche illisible", path, e, file=sys.stderr); continue
        b["title"] = clean_title(b["title"])
        b["kind"] = kind_of(b, hint)
        if b["title"] and b["date"]: books[bid] = b
    # on garde aussi les fiches déjà connues qui ne sont plus listées mais restent dans la fenêtre
    for bid, b in old.items():
        b["title"] = clean_title(b["title"]); books.setdefault(bid, b)
    lo, hi = (date.today() - timedelta(days=45)).isoformat(), (date.today() + timedelta(days=186)).isoformat()
    keep = sorted((b for b in books.values() if lo <= b["date"] <= hi), key=lambda b: (b["date"], b["title"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"source": "leslibraires.fr", "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "books": keep},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(len(keep), "livres gardés,", new, "fiches lues", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--test":
        page = open(sys.argv[2], encoding="utf-8").read()
        print(json.dumps(parse_book("/livre/123-x", page), ensure_ascii=False, indent=1)[:1500]); sys.exit()
    main()
