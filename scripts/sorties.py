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
MAX_REFRESH = int(os.environ.get("MAX_REFRESH", "30"))  # fiches déjà connues relues par passage (dates proches)
# rayons à suivre : page du rayon (pour trouver son dossier « Nouveautés ») et genre dans l'app
RAYONS = [
    ("/boutique/25/livres-papier/821432/romance", "romance"),
    ("/boutique/25/livres-papier/821434/science-fiction-fantastique-fantasy", "fantasy"),
    ("/boutique/25/livres-papier/821433/policier-thriller", "policier"),
    ("/boutique/25/livres-papier/746338/litterature-jeunes-adultes", "ya"),
    ("/boutique/25/livres-papier/113870/bd-comics-mangas", "bd"),
    ("/boutique/25/livres-papier/113534/litterature-generale", "roman"),
    ("/boutique/25/livres-papier/113821/jeunesse-", "jeunesse"),
]
# pages de 12 lues par dossier « Nouveautés » (un rayon très actif comme la BD/manga en demande davantage)
RAYON_PAGES = {"bd": 24, "roman": 18, "policier": 18, "jeunesse": 15}
MONTHS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split())}

_last = [0.0]
COUNT = {"pages": 0, "echecs": 0, "reprises": 0}
def get(path):
    """Page du libraire (5 s entre deux pages). Une seconde chance après 10 s pour une erreur passagère (pas pour 403/404)."""
    for essai in (1, 2):
        wait = DELAY - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        if essai == 1: COUNT["pages"] += 1
        req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("  échec", path, e, file=sys.stderr)
            if essai == 1 and getattr(e, "code", 0) not in (403, 404, 410):
                COUNT["reprises"] += 1; time.sleep(10); continue
            COUNT["echecs"] += 1
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
        "prix": float((re.search(r'itemprop="price" content="(\d+(?:\.\d+)?)"', page) or [0, 0])[1] or 0),
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

NOT_BOOK_RE = re.compile(r"vivre ?cards?|puzzle \d+ pi[eè]ces|calendrier mural|calendrier \d{4}|^agenda\b|\bagenda\b.*\b20\d\d\b|^peluches?\b|jeux? de soci[ée]t[ée]"
                         r"|^kit\b|^tarot\b|- tarot$|marque.pages? stickers|coffret avec (lampe|accessoires)|\bposters?\b|\bgoodies\b|\bt-shirt\b|\bmugs?\b"
                         r"|\bstickers?\b|calendrier de l.avent|\blivres?[- ]puzzles?\b|\bbo[iî]te jeu|karuta|bloc de jeux|^(mon|ma) (coffret|box)\b|\bjeux et activit[ée]s\b"
                         r"|\bpack offre d[ée]couverte|\(box \d+ ?- ?vol|^la revue dessin[ée]e\b|^(l.[ée]l[ée]phant|pouvoirs) ?-? ?n° ?\d+", re.I)

# Maisons qui ferment leur site aux robots : on demande leurs sorties à Google Livres, une fois par jour
GPUBS = [("Gallimard", "roman"), ("Folio", ""), ("Gallimard Jeunesse", "jeunesse"), ("Denoël", "roman"), ("Mercure de France", "roman"),
         ("Flammarion", "roman"), ("J'ai lu", ""), ("Pocket", ""), ("Robert Laffont", "roman"), ("Plon", "roman"), ("Julliard", "roman"),
         ("Belfond", "roman"), ("Fleuve", ""), ("10/18", ""), ("Presses de la Cité", "roman"), ("Actes Sud", "roman"),
         ("Milady", "fantasy"), ("Kurokawa", "bd"), ("Nathan", "jeunesse"), ("L'École des loisirs", "jeunesse"), ("Casterman", ""),
         ("Rue de Sèvres", "bd"), ("Harlequin", "romance"), ("HarperCollins", "")]

def gget(q, start):
    url = ("https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode(
        {"q": q, "orderBy": "newest", "langRestrict": "fr", "printType": "books", "maxResults": 40, "startIndex": start, "country": "FR", "key": GKEY}))
    req = urllib.request.Request(url, headers={"Referer": "https://jarvis77j.github.io/bibliotheque/", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("items", [])
    except Exception as e:
        print("  google", q, e, file=sys.stderr); return None

def google_upcoming(lo, hi, stats, queries=None, key="google"):
    out, errors, seen_items, max_d, sample = {}, 0, 0, "", []
    for q, hint in (queries or GQUERIES):
        want = q.split('"')[1].lower() if queries and '"' in q else ""  # éditeur demandé : Google en renvoie parfois d'autres
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
                if want and want.split()[0] not in (v.get("publisher") or "").lower(): continue
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
    stats[key] = {"trouves": len(out), "erreurs": errors, "vus": seen_items, "plus_loin": max_d, "exemples": sample}
    return out

def main():
    t_start = time.time()
    try:
        prev = json.load(open(OUT, encoding="utf-8"))
        old = {b["id"]: b for b in prev["books"]}
        prev_stats = prev.get("stats", {})
        ed_at = prev_stats.get("editeurs_at", "")
    except Exception:
        old, ed_at, prev_stats, prev = {}, "", {}, {}
    todo = {}  # chemin -> genre suggéré
    stats = {"precommandes": [], "nouveautes": [], "rayons": {}}
    old_count = len(old)
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
        for p in range(1, RAYON_PAGES.get(k, 12) + 1):
            links = list_links(get(d + ("" if p == 1 else f"?page={p}")))
            if not links or seen_r.issuperset(links): break
            seen_r.update(links)
            for l in links: todo[l] = k
    print(len(todo), "livres listés", file=sys.stderr)
    t_fiches = time.time()
    stats["libraire"] = {"pages_listes": COUNT["pages"], "echecs": COUNT["echecs"], "secondes_listes": round(t_fiches - t_start)}
    books, new, skipped = {}, 0, 0
    today_iso = date.today().isoformat()
    soon_lo, soon_hi = (date.today() - timedelta(days=3)).isoformat(), (date.today() + timedelta(days=10)).isoformat()
    refreshed, changed = 0, []
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
            b["lu"] = today_iso  # lue aujourd'hui : pas relue avant demain
        elif refreshed < MAX_REFRESH and soon_lo <= b.get("date", "") <= soon_hi and b.get("lu", "") < today_iso:
            # sortie proche : on relit la fiche une fois par jour, car la date peut avoir été repoussée ou avancée
            page = get(path); refreshed += 1
            try: nb = parse_book(path, page) if page else None
            except Exception: nb = None
            if nb and nb["date"]:
                if nb["date"] != b["date"]:
                    changed.append({"id": bid, "titre": b["title"][:40], "avant": b["date"], "apres": nb["date"]})
                    b["date"] = nb["date"]
                b["lu"] = today_iso
        b["title"] = clean_title(b["title"])
        b["kind"] = kind_of(b, hint)
        if b["title"] and b["date"]: books[bid] = b
    # Google Livres seulement à la demande (GOOGLE=1) : la clé et son quota (1 000 recherches/jour) sont partagés
    # avec les recherches de l'app, et Google ne donne presque pas de sorties françaises à venir
    t = date.today(); m2 = (t.month - 3) % 12 + 1
    # on garde depuis le 1er du mois d'il y a deux mois (août quand on est en octobre)
    lo, hi = date(t.year - (1 if t.month <= 2 else 0), m2, 1).isoformat(), (date.today() + timedelta(days=186)).isoformat()
    # Google par éditeur : une fois par jour (environ 70 recherches sur les 1 000 du quota partagé)
    g_at = prev_stats.get("google_editeurs_at", "")
    g_stale = not g_at or datetime.utcnow() - datetime.strptime(g_at, "%Y-%m-%dT%H:%MZ") > timedelta(hours=22)
    # Hors service : depuis les serveurs de GitHub (États-Unis), Google ne renvoie rien pour ces éditeurs ;
    # c'est l'app qui les demande, depuis le téléphone en France. Relançable à la main avec GOOGLE_EDITEURS=1.
    if os.environ.get("GOOGLE_EDITEURS") == "1":
        gq = [('inpublisher:"%s"' % p, k) for p, k in GPUBS]
        ge = google_upcoming(lo, hi, stats, gq, "google_editeurs")
        if ge and stats["google_editeurs"]["erreurs"] < 5:
            old = {k: v for k, v in old.items() if not k.startswith("ge:")}
            g_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
        isbns = {b.get("isbn") for b in books.values() if b.get("isbn")}
        for b in ge.values():
            if b["isbn"] and b["isbn"] in isbns: continue
            b["id"] = "ge:" + b["id"][3:]; b["source"] = "google"
            books[b["id"]] = b
    if g_at: stats["google_editeurs_at"] = g_at
    if os.environ.get("GOOGLE") == "1":
        gb = google_upcoming(date.today().isoformat(), hi, stats)
        if gb: old = {k: v for k, v in old.items() if not k.startswith("gb:")}
        isbns = {b.get("isbn") for b in books.values() if b.get("isbn")}
        for bid, b in gb.items():
            if b["isbn"] and b["isbn"] in isbns: continue
            books[bid] = b
    # Sites des éditeurs (Hachette et ses maisons, Glénat, Seuil, manga, BD, maisons généralistes).
    # editeurs.collect décide quoi lire à ce tour : lecture complète d'une unité au plus une fois par jour, lecture
    # « proche » (J-14 à J+45) toutes les 4 h, unités coupées ou en erreur reprises en tête au tour suivant.
    # tout le robot en 34 minutes au plus (le job GitHub est coupé à 60) : les éditeurs ont ce qui reste (28 min au plus)
    t_ed = time.time()
    ecarts = []
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import editeurs
        ed, est = editeurs.collect(lo, hi, end=min(t_start + 34 * 60, time.time() + 28 * 60),
                                   state=prev_stats.get("suivi"), force=os.environ.get("EDITEURS") == "1",
                                   fixtures=os.environ.get("FIXTURES") or None,
                                   fiches_lues={k for k, v in old.items() if v.get("fiche")})
        stats["suivi"] = est.pop("suivi", {})
        stats["plan"] = est.pop("plan", [])
        # les sources non relues à ce tour gardent leurs derniers chiffres (avec l'heure de leur dernière lecture)
        stats["editeurs"] = {k: v for k, v in (prev_stats.get("editeurs") or {}).items() if isinstance(v, dict)}
        now_s = datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
        for k, v in est.items():
            if isinstance(v, dict) and v.get("statut") != "saute": v["le"] = now_s
            if isinstance(v, dict) and v.get("statut") == "saute": continue
            stats["editeurs"][k] = v
        stats["editeurs"]["erreurs"] = est.get("erreurs", 0)
        if any(isinstance(v, dict) and v.get("livres") for v in est.values()):
            ed_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
        # sources relues en entier (sur leur fenêtre) et sans accroc : leurs anciennes fiches de cette fenêtre sont remplacées
        ok = {s_: v["fenetre"] for s_, v in est.items()
              if isinstance(v, dict) and v.get("livres") and v.get("statut") in ("ok", "partiel") and v.get("fenetre")}
        replaced = lambda v: (v["id"].startswith("ed:") and v.get("source", "").split(":")[-1] in ok
                              and ok[v["source"].split(":")[-1]][1] <= v.get("date", "") <= ok[v["source"].split(":")[-1]][2])
        gone = {k: v for k, v in old.items() if replaced(v)}
        old = {k: v for k, v in old.items() if not replaced(v)}
        if ed:
            by_isbn = {b["isbn"]: b for b in [*old.values(), *books.values()] if b.get("isbn") and not b["id"].startswith("ed:")}
            for isbn, b in ed.items():
                same = by_isbn.get(isbn)
                if same:  # déjà chez le libraire : on complète ce qui manque (couverture, auteurs, résumé)
                    for f in ("cover", "authors", "description", "prix"):
                        if not same.get(f) and b.get(f): same[f] = b[f]
                    if same.get("date") and b.get("date") and same["date"] != b["date"]: same["date_autre"] = b["date"]
                    else: same.pop("date_autre", None)
                    if same.get("date") and b.get("date") and same["date"] != b["date"]:
                        ecarts.append({"isbn": isbn, "titre": b["title"][:40], "libraire": same["date"], b.get("source", "editeur"): b["date"]})
                    continue
                for f in ("cover", "authors", "description", "fiche"):  # acquis d'une récolte précédente (fiches lues, cache)
                    if not b.get(f) and gone.get(b["id"], {}).get(f): b[f] = gone[b["id"]][f]
                books[b["id"]] = b
    except Exception as e:
        stats["editeurs"] = dict(prev_stats.get("editeurs") or {}) if isinstance(prev_stats.get("editeurs"), dict) else {}
        stats["suivi"] = prev_stats.get("suivi", {})
        stats["erreur_editeurs"] = str(e)[:300]
        print("  éditeurs :", e, file=sys.stderr)
    stats["secondes_editeurs"] = round(time.time() - t_ed)
    # on garde aussi les fiches déjà connues qui ne sont plus listées mais restent dans la fenêtre
    for bid, b in old.items():
        b["title"] = clean_title(b["title"])
        if b.get("isbn") and any(x.get("isbn") == b["isbn"] for x in books.values()): continue
        books.setdefault(bid, b)
    stats["uniques"] = len(stats.get("uniques", ()))
    stats["dates_relues"] = {"fiches": refreshed, "changees": changed[:30]}
    if ecarts: stats["ecarts_libraire"] = {"nombre": len(ecarts), "exemples": ecarts[:30]}

    if ed_at: stats["editeurs_at"] = ed_at
    stats.update(listes=len(todo), lues=new, en_attente=skipped, plus_loin=max((b["date"] for b in books.values()), default=""))
    # pas les objets vendus en librairie qui ne sont pas des livres (cartes, puzzles, peluches, calendriers…)
    keep = [b for b in books.values() if lo <= b["date"] <= hi and not NOT_BOOK_RE.search(b["title"])]
    try:  # même livre vu sur deux sites sans ISBN commun (manga, BD) : une seule fiche
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import editeurs
        n_all = len(keep)
        keep = editeurs.tidy(keep, NOT_BOOK_RE)  # titres propres, faux auteurs, essais hors « roman », publics hors app
        stats["nettoyes"] = n_all - len(keep)
        n0, keep = len(keep), editeurs.dedupe(keep)
        stats["doublons"] = n0 - len(keep)
    except Exception as e:
        print("  doublons :", e, file=sys.stderr)
    keep.sort(key=lambda b: (b["date"], b["title"]))
    stats["libraire"].update(pages=COUNT["pages"], echecs=COUNT["echecs"], reprises=COUNT["reprises"], fiches_lues=new,
                             secondes=round(t_ed - t_start), statut="erreur" if todo == {} else ("incomplet" if skipped else "ok"))
    # tableau clair, une ligne par source : statut, livres, pages, secondes, erreurs, dernière lecture
    src = {"leslibraires": {**stats["libraire"], "livres": sum(1 for b in keep if not b["id"].startswith(("ed:", "ge:", "gb:")))}}
    for k, v in (stats.get("editeurs") or {}).items():
        if isinstance(v, dict) and "pages" in v:
            src[k] = {f: v.get(f) for f in ("statut", "livres", "pages", "secondes", "erreurs", "incomplet", "fenetre", "le") if v.get(f) is not None}
            src[k]["en_base"] = sum(1 for b in keep if b.get("source", "").split(":")[-1] == k)
    stats["sources"] = src
    stats["duree_secondes"] = round(time.time() - t_start)
    for k, v in src.items():
        print(f"  source {k:14} {v.get('statut', '?'):10} en base={v.get('en_base', v.get('livres', 0)):5} lus={v.get('livres', 0):5} "
              f"pages={v.get('pages', 0):4} sec={v.get('secondes', 0):4} erreurs={v.get('erreurs', v.get('echecs', 0))}", file=sys.stderr)
    old_win = sum(1 for b in (prev.get("books") or []) if lo <= b.get("date", "") <= hi)
    # garde-fou : pas d'écriture qui ferait fondre le fichier d'un coup (site en panne, lecture ratée) ; on garde alors l'ancien contenu.
    # Mais jamais pour toujours : après 4 refus de suite (4 h), ou si on le demande (ACCEPTER=1), la nouvelle lecture est acceptée.
    refus = int((prev.get("stats") or {}).get("refus", 0) or 0)
    if old_count > 500 and len(keep) < 0.85 * old_win and refus < 4 and os.environ.get("ACCEPTER") != "1":
        print("  ALERTE : le résultat est bien plus petit que l'ancien fichier, il n'est pas écrit", file=sys.stderr)
        try:
            prev["stats"] = {**prev.get("stats", {}), "refus": refus + 1,
                             "alerte": datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ") + " : lecture trop petite (" + str(len(keep)) + " livres au lieu de " + str(old_win) + "), ancien fichier gardé"}
            tmp = OUT + ".tmp"; json.dump(prev, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=0); os.replace(tmp, OUT)
        except Exception: pass
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"  # écriture complète puis remplacement : un arrêt en cours de route ne laisse jamais un fichier tronqué
    json.dump({"source": "leslibraires.fr", "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "stats": stats, "books": keep},
              open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    os.replace(tmp, OUT)
    print(len(keep), "livres gardés,", new, "fiches lues", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--test":
        page = open(sys.argv[2], encoding="utf-8").read()
        print(json.dumps(parse_book("/livre/123-x", page), ensure_ascii=False, indent=1)[:1500]); sys.exit()
    main()
