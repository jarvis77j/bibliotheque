#!/usr/bin/env python3
"""Récupère les sorties de livres sur leslibraires.fr (réseau de librairies indépendantes)
et les écrit dans data/sorties.json, lu par l'onglet « Sorties » de l'app.

Lancé par GitHub Actions plusieurs fois par jour. Respecte le robots.txt du site
(pages /dossiers/ et /livre/ autorisées, 5 secondes entre deux pages).
Les fiches déjà connues ne sont pas retéléchargées."""
import html, json, os, re, sys, time, urllib.parse, urllib.request
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

# ---------- Google Livres : sorties annoncées plus loin (le libraire ne liste qu'environ un mois) ----------
GKEY = "AIzaSyDOeFi3IlADcw-C6MdXdJpR9yzDAvEy5DA"  # clé de l'app, limitée à jarvis77j.github.io
GQUERIES = [
    ('subject:"romance"', "romance"), ('subject:"fantasy"', "fantasy"), ('subject:"science fiction"', "fantasy"),
    ('subject:"thriller"', "policier"), ('subject:"mystery"', "policier"), ('subject:"young adult"', "ya"),
    ('subject:"fiction"', "roman"), ("roman", "roman"), ("tome", ""), ("dark romance", "romance"), ("romantasy", "fantasy"),
    ("manga", "bd"), ("bande dessinée", "bd"),
    ('inpublisher:"Hugo"', "romance"), ('inpublisher:"Bragelonne"', "fantasy"), ('inpublisher:"Albin Michel"', "roman"),
    ('inpublisher:"Michel Lafon"', ""), ('inpublisher:"Gallimard"', "roman"), ('inpublisher:"Robert Laffont"', "roman"),
    ('inpublisher:"Pocket"', ""), ('inpublisher:"J\'ai lu"', ""), ('inpublisher:"Glénat"', "bd"), ('inpublisher:"Pika"', "bd"),
    ('inpublisher:"Kana"', "bd"), ('inpublisher:"Milady"', "fantasy"), ('inpublisher:"Chatterley"', "romance"),
    ('inpublisher:"Calmann-Lévy"', "roman"), ('inpublisher:"Fayard"', "roman"), ('inpublisher:"De Saxus"', "fantasy"),
    ('inpublisher:"Nathan"', "ya"), ('inpublisher:"Hachette"', ""), ('inpublisher:"Le Livre de Poche"', ""),
]
GKINDS = [(("romance", "love"), "romance"), (("fantasy", "science fiction", "dragons"), "fantasy"), (("thriller", "mystery", "crime", "detective"), "policier"),
          (("young adult",), "ya"), (("comics", "graphic novels", "manga"), "bd"), (("juvenile",), "jeunesse"), (("fiction",), "roman")]

def gget(q, start):
    url = ("https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode(
        {"q": q, "orderBy": "newest", "langRestrict": "fr", "printType": "books", "maxResults": 40, "startIndex": start, "key": GKEY}))
    req = urllib.request.Request(url, headers={"Referer": "https://jarvis77j.github.io/bibliotheque/", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("items", [])
    except Exception as e:
        print("  google", q, e, file=sys.stderr); return None

def google_upcoming(lo, hi, stats):
    out, errors, seen_items, max_d, sample = {}, 0, 0, "", []
    for q, hint in GQUERIES:
        for start in (0, 40, 80):
            items = gget(q, start); time.sleep(1)
            if items is None: errors += 1; break
            if not items: break
            newer = 0
            for it in items:
                v = it.get("volumeInfo", {})
                d = v.get("publishedDate", "")
                seen_items += 1; max_d = max(max_d, d)
                if len(sample) < 6 and start == 0: sample.append(d + " " + v.get("title", "")[:30])
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) or v.get("language") not in (None, "fr"): continue
                if d >= lo: newer += 1
                if not (lo <= d <= hi) or not v.get("title"): continue
                isbn = next((x["identifier"] for x in v.get("industryIdentifiers", []) if x.get("type") == "ISBN_13"), "")
                links = v.get("imageLinks", {})
                cover = (links.get("thumbnail") or links.get("smallThumbnail") or "").replace("http:", "https:").replace("&edge=curl", "")
                cats = " ".join(v.get("categories", [])).lower()
                kind = next((k for words, k in GKINDS if any(w in cats for w in words)), hint)
                title = v["title"] + (" - " + v["subtitle"] if v.get("subtitle") and len(v["subtitle"]) < 40 else "")
                out["gb:" + it["id"]] = {
                    "id": "gb:" + it["id"], "title": clean_title(title), "authors": v.get("authors", [])[:3], "publisher": v.get("publisher", ""),
                    "date": d, "isbn": isbn, "pages": v.get("pageCount", 0), "format": "", "cover": cover,
                    "description": html.unescape(re.sub(r"<[^>]+>", "", v.get("description", "")))[:1500], "rayons": v.get("categories", [])[:3],
                    "url": v.get("infoLink", ""), "kind": kind, "source": "google",
                    "mature": v.get("maturityRating") == "MATURE",
                }
            if not newer: break  # la suite de la liste est plus ancienne
    stats["google"] = {"trouves": len(out), "erreurs": errors, "vus": seen_items, "plus_loin": max_d, "exemples": sample}
    return out

def main():
    try:
        old = {b["id"]: b for b in json.load(open(OUT, encoding="utf-8"))["books"]}
    except Exception:
        old = {}
    todo = {}  # chemin -> genre suggéré
    stats = {"precommandes": [], "nouveautes": [], "rayons": {}}
    # précommandes : on va loin pour voir les sorties des 6 prochains mois
    for p in range(1, 31):
        page = get(f"/dossiers/precommandes/?page={p}")
        links = list_links(page)
        stats["precommandes"].append(len(links) if page else -1)
        # après la dernière page, le site renvoie la première : on s'arrête dès qu'on ne voit plus rien de neuf
        seen = stats.setdefault("uniques", set())
        if not links or seen.issuperset(links): break
        seen.update(links)
        for l in links: todo.setdefault(l, "")
    seen_n = set()
    for p in range(1, 21):  # assez loin pour remonter aux deux mois passés
        links = list_links(get(f"/dossiers/nouveautes/?page={p}"))
        stats["nouveautes"].append(len(links))
        if not links or seen_n.issuperset(links): break
        seen_n.update(links)
        for l in links: todo.setdefault(l, "")
    for rayon, k in RAYONS:
        d = nouveautes_dossier(get(rayon))
        stats["rayons"][k] = d or "introuvable"
        if not d: continue
        seen_r = set()
        for p in range(1, 13):
            links = list_links(get(d + ("" if p == 1 else f"?page={p}")))
            if not links or seen_r.issuperset(links): break
            seen_r.update(links)
            for l in links: todo[l] = k
    print(len(todo), "livres listés", file=sys.stderr)
    books, new, skipped = {}, 0, 0
    for path, hint in todo.items():
        bid = "ll:" + path.split("/")[2].split("-")[0]
        b = old.get(bid)
        if not b:
            if new >= MAX_NEW: skipped += 1; continue
            page = get(path); new += 1
            if not page: continue
            try: b = parse_book(path, page)
            except Exception as e:
                print("  fiche illisible", path, e, file=sys.stderr); continue
        b["title"] = clean_title(b["title"])
        b["kind"] = kind_of(b, hint)
        if b["title"] and b["date"]: books[bid] = b
    # Google Livres seulement à la demande (GOOGLE=1) : la clé et son quota (1 000 recherches/jour) sont partagés
    # avec les recherches de l'app, et Google ne donne presque pas de sorties françaises à venir
    t = date.today(); m2 = (t.month - 3) % 12 + 1
    # on garde depuis le 1er du mois d'il y a deux mois (août quand on est en octobre)
    lo, hi = date(t.year - (1 if t.month <= 2 else 0), m2, 1).isoformat(), (date.today() + timedelta(days=186)).isoformat()
    if os.environ.get("GOOGLE") == "1":
        gb = google_upcoming(date.today().isoformat(), hi, stats)
        if gb: old = {k: v for k, v in old.items() if not k.startswith("gb:")}
        isbns = {b.get("isbn") for b in books.values() if b.get("isbn")}
        for bid, b in gb.items():
            if b["isbn"] and b["isbn"] in isbns: continue
            books[bid] = b
    # Sites des éditeurs (Hachette et ses maisons, Glénat, Seuil) : environ 1 000 sorties par mois, datées au jour.
    # Une fois par jour (environ 8 minutes de lecture polie) ; entre-temps on garde la dernière récolte.
    if datetime.utcnow().hour == 4 or os.environ.get("EDITEURS") == "1" or (datetime.utcnow().hour % 3 == 1 and not any(k.startswith("ed:") for k in old)):
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import editeurs
            ed, stats["editeurs"] = editeurs.collect(lo, hi)
            if ed:
                old = {k: v for k, v in old.items() if not k.startswith("ed:")}
                by_isbn = {b["isbn"]: b for b in books.values() if b.get("isbn")}
                for isbn, b in ed.items():
                    same = by_isbn.get(isbn)
                    if same:  # déjà chez le libraire : on complète seulement la couverture
                        if not same.get("cover") and b.get("cover"): same["cover"] = b["cover"]
                        continue
                    books[b["id"]] = b
        except Exception as e:
            stats["editeurs"] = "erreur : " + str(e)
            print("  éditeurs :", e, file=sys.stderr)
    # on garde aussi les fiches déjà connues qui ne sont plus listées mais restent dans la fenêtre
    for bid, b in old.items():
        b["title"] = clean_title(b["title"])
        if b.get("isbn") and any(x.get("isbn") == b["isbn"] for x in books.values()): continue
        books.setdefault(bid, b)
    stats["uniques"] = len(stats.get("uniques", ()))
    stats.update(listes=len(todo), lues=new, en_attente=skipped, plus_loin=max((b["date"] for b in books.values()), default=""))
    keep = sorted((b for b in books.values() if lo <= b["date"] <= hi), key=lambda b: (b["date"], b["title"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"source": "leslibraires.fr", "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "stats": stats, "books": keep},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(len(keep), "livres gardés,", new, "fiches lues", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--test":
        page = open(sys.argv[2], encoding="utf-8").read()
        print(json.dumps(parse_book("/livre/123-x", page), ensure_ascii=False, indent=1)[:1500]); sys.exit()
    main()
