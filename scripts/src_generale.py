#!/usr/bin/env python3
"""Sorties des éditeurs généralistes (romans, polars, romance, imaginaire, jeunesse).

Sources (pages publiques, robots.txt vérifié par le Fetcher à chaque lecture) :
  michellafon    michel-lafon.fr/nos-livres?3049e819_page=N   tout le catalogue A→Z (50 / page, ~38 pages), date au jour
                 dans la liste, EAN tiré de l'URL (49xxxxxx → 97827…, 22xxxxxx → 97910…) ou du nom de la couverture
  jailu          jailu.com/nouveautes                          1 page, ~80 livres du dernier mois, date au jour
  bragelonne     bragelonne.fr/a-paraitre/?page=N              à paraître (~2 pages, jusqu'à 3-4 mois), date au jour ; eBook retirés
  albinmichel    albin-michel.fr/a-paraitre + /nouveautes (carrousels par rayon, sans date) → une fiche par livre
  hugo           hugopublishing.fr/a-paraitre/?paged=N + /nouveautes/?paged=N (sans date ni rayon), croisées avec la tête des
                 pages /univers/<fiction>/ → une fiche par livre de fiction
  points         editionspoints.com/nouveautes (sans date) → une fiche par livre
  bayard         tout.bayard-jeunesse.com/livres/nouveautes/page/N/ (sans date) → une fiche par livre
  milan          editionsmilan.com/livres/nouveautes/page/N/ (sans date) → une fiche par livre
Non retenus : Flammarion et Flammarion Jeunesse (listes « à paraître / nouveautés » uniquement sous /Catalogue/(parution)/,
chemin que leur robots.txt veut interdire) ; HarperCollins (liste rendue en JavaScript depuis un service tiers, Algolia : pas utilisé).

Fiches : au plus FICHES_MAX par jour au total (et FICHES_PAR_SOURCE par site). Un livre déjà présent dans
data/sorties.json (même id, daté) n'est pas relu : on reprend ce qu'on sait. Les livres déjà connus d'une source à
liste « glissante » (nouveautés récentes) qui ne sont plus listés mais restent dans la fenêtre sont gardés.
"""
import html, json, os, re, sys, time, urllib.parse
from datetime import datetime, timezone

try:
    import editeurs
except ImportError:
    sys.path.insert(0, "/home/claude/bibliotheque/scripts")
    import editeurs

FICHES_MAX = 150
FICHES_PAR_SOURCE = {"albinmichel": 40, "hugo": 30, "points": 25, "bayard": 30, "milan": 25}
EAN = re.compile(r"97[89]\d{10}")
EN_MONTHS = {m: i + 1 for i, m in enumerate("january february march april may june july august september october november december".split())}

# --- petits outils -------------------------------------------------------------------------------------------------

def txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()

def iso_en(s):
    m = re.search(r"\b([A-Z][a-z]+) (\d{1,2}), (\d{4})\b", s or "")
    if not m or m.group(1).lower() not in EN_MONTHS: return ""
    return f"{m.group(3)}-{EN_MONTHS[m.group(1).lower()]:02d}-{int(m.group(2)):02d}"

KIND_WORDS = [("bd", ("bd", "bande dessinee", "bandes dessinees", "manga", "mangas", "webtoon", "comics", "roman graphique", "histoires graphiques")),
              ("romance", ("romance", "romances", "new romance", "sentimental", "litterature feminine", "romance historique")),
              ("ya", ("young adult", "ya", "ados", "romans ados", "jeunes adultes", "13 ans et", "15 ans et", "romans 13", "13")),
              ("fantasy", ("fantasy", "fantastique", "imaginaire", "science fiction", "sf", "dystopie", "terreur", "horreur")),
              ("policier", ("polar", "polars", "policier", "policiers", "thriller", "thrillers", "suspense", "noir", "policier thriller")),
              ("jeunesse", ("jeunesse", "albums", "album", "eveil", "premieres lectures", "8 12 ans", "romans 8", "contes", "documentaires",
                            "des 2 ans", "des 4 ans", "des 7 ans", "3 7 ans", "petite enfance")),
              ("roman", ("roman", "romans", "litterature", "litterature francaise", "litterature etrangere", "fiction", "fiction romans",
                         "nouvelles", "romans et recits historiques"))]

def kind_of(*parts):
    hay = " " + " ".join(editeurs.norm(p) for p in parts if p) + " "
    for k, words in KIND_WORDS:
        if any(f" {w} " in hay for w in words): return k
    return ""

SKIP_TITLE = re.compile(r"\b(calendriers?|agendas?|coffrets?|carnets?|kits?|papeterie|marque-pages?|puzzles?|jeu de cartes|coloriages?|"
                        r"à colorier|cherche et trouve|jeux des différences|autocollants?|stickers?|ebook|e-book|livre audio)\b", re.I)
SKIP_THEMES = {"cuisine", "sante vie de famille", "developpement personnel", "business management", "vie pratique", "bien etre",
               "psychologie bien etre et developpement personnel", "esoterisme", "pratique", "hugo sport", "sport"}

def book(source, publisher, title, date, isbn="", authors=(), cover="", url="", kind="", rayons=(), fmt="", pages=0, desc="", slug=""):
    title = re.sub(r"^Couverture (du livre |de )?", "", txt(title)).strip(" -")
    if isbn and not EAN.fullmatch(isbn): isbn = ""
    if cover.startswith("//"): cover = "https:" + cover
    if cover and (not cover.startswith("https://") or re.search(r"default-cover|placeholder|indisponible", cover)): cover = ""
    return {"id": f"ed:{isbn}" if isbn else f"ed:{source}:{slug or editeurs.norm(title).replace(' ', '-')}",
            "title": title, "authors": [a for a in dict.fromkeys(txt(a) for a in authors) if a][:3], "publisher": publisher,
            "date": date, "isbn": isbn, "pages": int(pages or 0), "format": fmt, "cover": cover, "description": txt(desc)[:1500],
            "rayons": [r for r in dict.fromkeys(txt(r) for r in rayons) if r][:3], "url": url, "kind": kind,
            "source": "editeur:" + source}


class Ctx:
    """État partagé d'une récolte : fetch, fenêtre, échéance, budget de fiches, livres déjà connus."""
    def __init__(self, lo, hi, fetch, deadline):
        self.lo, self.hi, self.fetch, self.deadline = lo, hi, fetch, deadline
        self.fiches, self.pages, self.cut = 0, 0, False
        self.known = {}
        if not getattr(fetch, "fixtures", None):  # hors ligne (tests) : on ne lit pas l'état du dépôt
            try:
                p = os.path.join(os.path.dirname(os.path.abspath(editeurs.__file__)), "..", "data", "sorties.json")
                self.known = {b["id"]: b for b in json.load(open(p, encoding="utf-8"))["books"] if b.get("date")}
            except Exception:
                self.known = {}
        # ISBN déjà présents par une autre source (leslibraires.fr…) : inutile de relire la fiche chaque jour
        self.known_isbn = {b["isbn"] for b in self.known.values() if b.get("isbn")}

    def late(self):
        if bool(self.deadline) and time.time() > self.deadline: self.cut = True
        return getattr(self, "cut", False)

    def get(self, url, key):
        if self.late(): return ""
        self.pages += 1
        return self.fetch.get(url, key) or ""

    def in_window(self, b): return bool(b and b.get("date")) and self.lo <= b["date"] <= self.hi


# --- sources à liste datée -----------------------------------------------------------------------------------------

def ml_ean(path, cover):
    m = EAN.search(cover or "")
    if m: return m.group(0)
    m = re.search(r"-(\d{8})/?$", path)
    if not m: return ""
    d = m.group(1)
    return ("97827" + d) if d.startswith("49") else ("97910" + d) if d.startswith("22") else ""

# titres Michel Lafon : « Le Cercle de Kern - "Impossible à oublier" Maxime Chattam » → on retire les accroches commerciales
ML_PUB = re.compile(r"nouveaut|par l.auteur|par l.autrice|best-seller|phénomène|le nouveau roman|rentrée littéraire|prix |enfin en librairie"
                    r"|\"|«|le livre qui a inspiré|édition française|edition française|le roman officiel|livre de cuisine", re.I)

def ml_title(t):
    parts = t.split(" - ")
    return " - ".join([parts[0]] + [p for p in parts[1:] if not ML_PUB.search(p)])

ML_SKIP_CATS = {"cuisine", "cahier d activites jeux agenda", "pratique", "sante bien etre"}

def src_michellafon(c):
    base, out = "https://www.michel-lafon.fr", {}
    seen_prev = None
    for n in range(1, 60):
        page = c.get(f"{base}/nos-livres?3049e819_page={n}", f"michellafon-{n}")
        items = re.split(r'<div role="listitem" class="book_item w-dyn-item">', page)[1:]
        keys = set()
        for it in items:
            m = re.search(r'href="(/books/[^"]+)"', it)
            if not m: continue
            path = m.group(1); keys.add(path)
            d = iso_en(txt(re.search(r'class="book-item_date[^"]*">([^<]*)<', it).group(1)) if 'book-item_date' in it else "")
            if not d or not (c.lo <= d <= c.hi): continue
            title = ml_title(txt((re.search(r'class="book-item_title">(.*?)</h2>', it) or re.search(r'book-item_title">(.*?)</h', it)).group(1)))
            cat = txt((re.search(r'book-item_category">([^<]*)<', it) or [None, ""])[1])
            sub = txt((re.search(r'book-item_subtheme">([^<]*)<', it) or [None, ""])[1])
            if SKIP_TITLE.search(title) or editeurs.norm(sub) in SKIP_THEMES or editeurs.norm(cat) in ML_SKIP_CATS \
                    or "almanach" in title.lower(): continue
            cover = (re.search(r'<img src="([^"]+)"', it) or [None, ""])[1]
            authors = re.findall(r'class="book-item_author">([^<]*)<', it)
            isbn = ml_ean(path, cover)
            k = kind_of(sub, cat if cat != "Jeunesse" else "jeunesse")
            if cat == "Jeunesse" and k in ("", "roman"): k = "jeunesse"
            if cat in ("Non fiction", "Livre illustré") and k == "roman": k = ""
            b = book("michellafon", "Michel Lafon", title, d, isbn, authors, cover, base + path, k, [r for r in (cat, sub) if r],
                     slug=path.rsplit("/", 1)[-1])
            out.setdefault(b["id"], b)
        if not items or keys == seen_prev: break
        seen_prev = keys
        if 'w-pagination-next' not in page: break
    return out

def src_jailu(c):
    base, out = "https://www.jailu.com", {}
    page = c.get(base + "/nouveautes", "jailu-nouveautes")
    for it in re.split(r'<article class="ListDisplay BookItem', page)[1:]:
        it = it.split("</article>")[0]
        g = re.search(r'data-gencod="(97[89]\d{10})"', it)
        d = editeurs.iso(txt((re.search(r'class="Book-date">(.*?)</p>', it, re.S) or [None, ""])[1]))
        if not g or not d: continue
        title = txt((re.search(r'class="Book-title">(.*?)</p>', it, re.S) or [None, ""])[1])
        sub = txt((re.search(r'data-field="subdomain">(.*?)</p>', it, re.S) or [None, ""])[1])
        if not title or editeurs.norm(sub) in SKIP_THEMES: continue
        cover = (re.search(r'(?:data-src|src)="(https://www\.jailu\.com/media/[^"]+)"', it) or [None, ""])[1]
        href = (re.search(r'href="(/[^"]+/97[89]\d{10})"', it) or [None, ""])[1]
        b = book("jailu", "J'ai lu", title, d, g.group(1), re.findall(r'class="Book-author"[^>]*>([^<]+)<', it), cover,
                 base + href, kind_of(sub) or "roman", [sub], "Poche")
        if c.in_window(b): out[b["id"]] = b
    return out

def src_bragelonne(c):
    base, out, seen_prev = "https://www.bragelonne.fr", {}, None
    for n in range(1, 8):
        page = c.get(f"{base}/a-paraitre/?page={n}", f"bragelonne-{n}")
        cards = re.findall(r'<a href="(/catalogue/(97[89]\d{10})-[^"]*)" class="book-card">(.*?)</a>\s*</div>', page, re.S)
        keys = {e for _, e, _ in cards}
        if not cards or keys == seen_prev: break
        seen_prev = keys
        for path, ean, body in cards:
            f = lambda cls: txt((re.search(r'class="book-card__' + cls + r'">(.*?)</div>', body, re.S) or [None, ""])[1])
            fmt, d = f("format"), editeurs.iso(f("release"))
            if not d or re.search(r"ebook|e-book|audio|numérique", fmt, re.I): continue
            title, serie = f("title"), f("serie")
            if serie and editeurs.norm(serie) not in editeurs.norm(title): title = f"{title} - {serie}"
            cover = (re.search(r'<img src="([^"]+)"', body) or [None, ""])[1]
            b = book("bragelonne", "Bragelonne", title, d, ean, [a.strip() for a in re.split(r",| et ", f("author"))], cover,
                     base + path, "fantasy", [], fmt)
            if SKIP_TITLE.search(title) or re.match(r"tarot\b", title, re.I): continue
            if c.in_window(b): out[b["id"]] = b
    return out

# --- sources à fiches ----------------------------------------------------------------------------------------------

def from_fiches(c, source, todo, parse):
    """todo : [(id, url, clé, indice)] dans l'ordre de priorité. parse(page, indice) -> livre ou None.
    Un livre connu (data/sorties.json) n'est pas relu ; les autres dans la limite du budget."""
    out, read = {}, 0
    cap = FICHES_PAR_SOURCE.get(source, 20)
    for bid, url, key, hint in todo:
        b = c.known.get(bid)
        if b and b.get("source") == "editeur:" + source:
            # Points : fiches lues avant que le genre ne soit repris de la collection → relues une fois
            relire = (source == "points" and not b.get("kind") and not b.get("rayons") and not b.get("refait")
                      and read < cap and c.fiches < FICHES_MAX and not c.late() and c.in_window(b))
            if not relire:
                if c.in_window(b): out[bid] = b
                continue
            page = c.get(url, key); read += 1; c.fiches += 1
            try: nb = parse(page, hint) if page else None
            except Exception: nb = None
            if nb: nb["refait"] = 1; out[bid] = nb
            else: out[bid] = b
            continue
        if bid[3:] in c.known_isbn: continue
        if read >= cap or c.fiches >= FICHES_MAX or c.late(): continue
        page = c.get(url, key); read += 1; c.fiches += 1
        if not page: continue
        try: b = parse(page, hint)
        except Exception as e:
            print(f"  fiche illisible {url} : {e}", file=sys.stderr); continue
        if b and c.in_window(b): out[b["id"]] = b
    # liste glissante : on garde ce qu'on savait déjà et qui reste dans la fenêtre
    for bid, b in c.known.items():
        if b.get("source") == "editeur:" + source and c.in_window(b): out.setdefault(bid, b)
    return out

def og(page, prop):
    m = re.search(r'<meta[^>]+property="og:' + prop + r'"[^>]+content="([^"]*)"', page) or \
        re.search(r'<meta[^>]+content="([^"]*)"[^>]+property="og:' + prop + '"', page)
    return html.unescape(m.group(1)) if m else ""

# Albin Michel
AM_RAYONS = {"/litterature": "roman", "/jeunesse": "jeunesse", "/bd": "bd"}

def src_albinmichel(c):
    base, todo, seen = "https://www.albin-michel.fr", [], set()
    for path, key in (("/a-paraitre", "albinmichel-aparaitre"), ("/nouveautes", "albinmichel-nouveautes")):
        page = c.get(base + path, key)
        parts = re.split(r'<div class="BooksList-category">\s*<h3><a href="([^"]+)">', page)
        for i in range(1, len(parts), 2):
            rayon = parts[i]
            if rayon not in AM_RAYONS: continue
            for it in re.split(r'<div class="BookTeaser swiper-slide"', parts[i + 1])[1:]:
                m = re.search(r'href="(/[^"#]*-(97[89]\d{10}))"', it)
                if not m or m.group(2) in seen: continue
                seen.add(m.group(2))
                cover = (re.search(r'<img [^>]*src="([^"]+)"', it) or [None, ""])[1]
                title = txt((re.search(r'class="BookTeaser-title">(.*?)</div>', it, re.S) or [None, ""])[1])
                authors = re.findall(r'BookContributor-type">\s*Auteur\s*:\s*</span>\s*<span class="BookContributor-author">\s*<a[^>]*>([^<]+)<', it)
                hint = {"title": title, "cover": (base + cover) if cover.startswith("/") else cover, "authors": authors,
                        "kind": AM_RAYONS[rayon], "path": m.group(1), "isbn": m.group(2)}
                if SKIP_TITLE.search(title): continue
                todo.append(("ed:" + m.group(2), base + m.group(1), "albinmichel-" + m.group(2), hint))

    def parse(page, h):
        q = re.sub(r"\s+", " ", page)
        # l'édition dont l'EAN est celui de l'URL (la fiche liste aussi poche / numérique)
        d = ""
        for m in re.finditer(r"Date de parution\s*(?:<[^>]+>\s*)*([^<]+)<", q):
            seg = q[m.end():m.end() + 3000]
            e = EAN.search(seg)
            if e and e.group(0) == h["isbn"]: d = editeurs.iso(m.group(1)); break
            if not d: d = editeurs.iso(m.group(1))
        if not d: return None
        crumbs = [txt(x) for x in re.findall(r'<a href="/(?:litterature|jeunesse|bd)/[a-z0-9-]+"[^>]*>([^<]+)</a>', q)[:2]]
        k = kind_of(*crumbs) or ("" if any("essai" in x.lower() for x in crumbs) else h["kind"])
        if h["kind"] == "jeunesse" and k == "roman": k = "jeunesse"
        pages = (re.search(r"(\d+) pages", q) or [None, 0])[1]
        cover = h["cover"] if "default-cover" not in h["cover"] else ""
        return book("albinmichel", "Albin Michel", h["title"], d, h["isbn"], h["authors"], cover or og(page, "image"),
                    base + h["path"], k, crumbs, "", pages, og(page, "description"))
    out = from_fiches(c, "albinmichel", todo, parse)
    for b in out.values(): b["date"] = editeurs.lundi_vers_mercredi(b["date"])  # aussi pour les fiches déjà lues
    return out

# Hugo Publishing
# univers Hugo (« Hugo Poche / Impact », « New Romance », « Neotoon »…) : premier mot reconnu dans l'ordre
HUGO_KINDS = [("romance", "romance"), ("impact", "policier"), ("thriller", "policier"), ("neotoon", "bd"), ("hugo bd", "bd"),
              ("manga", "bd"), ("jeunesse", "jeunesse"), ("fantasy", "fantasy"), ("roman", "roman")]
HUGO_SKIP = ("hugo image", "hugo sport", "hugo pratique", "game box", "beaux livres")

HUGO_UNIVERS = [("blanche", "romance"), ("hugo-poche", ""), ("hugo-roman", "roman"), ("hugo-thriller", "policier"), ("impact", "policier"),
                ("hugo-new-way-young-adult", "ya"), ("stardust", "ya"), ("neotoon", "bd"), ("hugo-bd", "bd"), ("hugo-jeunesse", "jeunesse")]
HUGO_CARD = re.compile(r'yonix/(97[89]\d{10})[^"]*?\.jpg.*?<div class="product-title">(.*?)</div>.*?href="(https://www\.hugopublishing\.fr/produits/([^/"]+)/)"', re.S)

def src_hugo(c):
    """Les listes à paraître / nouveautés n'ont ni date ni rayon : on ne lit la fiche que des livres présents en tête d'un
    univers de fiction (pages univers triées du plus récent au plus ancien), pour ne pas gaspiller de fiches en sport, jeux…"""
    base, todo, seen = "https://www.hugopublishing.fr", [], set()
    univ = {}
    for u, k in HUGO_UNIVERS:
        for n in (1, 2) if u in ("hugo-poche", "blanche") else (1,):
            page = c.get(f"{base}/univers/{u}/" + (f"?paged={n}" if n > 1 else ""), f"hugo-univers-{u}-{n}")
            for _, _, _, slug in HUGO_CARD.findall(page): univ.setdefault(slug, k)
    for lst in ("a-paraitre", "nouveautes"):
        for n in range(1, 12):
            page = c.get(f"{base}/{lst}/?paged={n}", f"hugo-{lst}-{n}")
            cards = HUGO_CARD.findall(page)
            fresh = [x for x in cards if x[3] not in seen]
            if not fresh: break
            for ean, title, url, slug in fresh:
                seen.add(slug)
                if SKIP_TITLE.search(txt(title)) or (univ and slug not in univ): continue
                todo.append(("ed:" + ean, url, "hugo-" + slug, {"isbn": ean, "title": txt(title), "url": url, "kind": univ.get(slug, "")}))

    def parse(page, h):
        q = re.sub(r"\s+", " ", page)
        d = editeurs.iso(txt((re.search(r'product-data-publication-date">(.*?)</div>', q) or [None, ""])[1]))
        if not d: return None
        isbn = (re.search(r"ISBN papier : (97[89]\d{10})", q) or [None, h["isbn"]])[1]
        univ = txt((re.search(r'product-data-univers">(.*?)</div>', q) or [None, ""])[1])
        nu = editeurs.norm(univ)
        if nu in SKIP_THEMES or any(x in nu for x in HUGO_SKIP): return None
        authors = re.findall(r'href="https://www\.hugopublishing\.fr/auteur/[^"]*"[^>]*>([^<]+)</a>', q.split('product-data-auteurs', 1)[-1][:3000])
        title = txt((re.search(r'<div class="product-title">\s*<h1>(.*?)</h1>', q) or [None, h["title"]])[1])
        k = next((v for w, v in HUGO_KINDS if w in nu), "") or h["kind"]
        return book("hugo", "Hugo Publishing", title, d, isbn, authors, og(page, "image"), h["url"], k, [univ] if univ else [],
                    desc=og(page, "description"))
    return from_fiches(c, "hugo", todo, parse)

# Points (même gabarit que seuil.com)
def src_points(c):
    base, todo, seen = "https://www.editionspoints.com", [], set()
    page = c.get(base + "/nouveautes", "points-nouveautes")
    for it in re.split(r'<div class="ouvrage couverture-hover"', page)[1:]:
        m = re.search(r'href="(https://www\.editionspoints\.com/ouvrage/[^"]+/(97[89]\d{10}))"', it)
        if not m or m.group(2) in seen: continue
        seen.add(m.group(2))
        title = txt((re.search(r'class="livre-titre">(.*?)</p>', it, re.S) or [None, ""])[1])
        cover = (re.search(r'data-lazy="([^"]+)"', it) or [None, ""])[1]
        authors = re.findall(r'<span class="auteur">([^<]+)</span>', it)
        todo.append(("ed:" + m.group(2), m.group(1), "points-" + m.group(2), {"isbn": m.group(2), "title": title, "cover": cover,
                                                                              "authors": authors, "url": m.group(1)}))

    def parse(page, h):
        q = re.sub(r"\s+", " ", page)
        d = editeurs.iso((re.search(r"Date de parution (\d\d/\d\d/\d{4})", q) or [None, ""])[1])
        if not d: return None
        themes = [t for t in (txt(x) for x in re.findall(r'itemprop="about"[^>]*>(.*?)</a>', q)) if t and t != "Nos collections"][:2]
        if not themes:  # « Nos collections » seul : le genre est la collection écrite juste après (« Points Policier », « Points Documents »…)
            coll = re.search(r'itemprop="about"[^>]*>Nos collections</a><br>\s*([^<]*)<br>\s*([^<]*)<br>', q)
            if coll: themes = [t for t in (txt(coll.group(1)), txt(coll.group(2))) if t][:2]
        pages = (re.search(r"(\d+) pages", q) or [None, 0])[1]
        return book("points", "Points", h["title"] or og(page, "title"), d, h["isbn"], h["authors"], h["cover"] or og(page, "image"),
                    h["url"], kind_of(*themes), themes, "Poche", pages, og(page, "description"))
    return from_fiches(c, "points", todo, parse)

# Bayard Jeunesse et Milan (même plateforme)
def src_bayard_milan(c, source):
    base = {"bayard": "https://tout.bayard-jeunesse.com", "milan": "https://www.editionsmilan.com"}[source]
    publisher = {"bayard": "Bayard Jeunesse", "milan": "Milan"}[source]
    todo, seen = [], set()
    for n in range(1, 10):
        url = f"{base}/livres/nouveautes/" + (f"page/{n}/" if n > 1 else "")
        page = re.sub(r"\s+", " ", c.get(url, f"{source}-{n}"))
        h1 = page.find("<h1")
        arts = re.findall(r'<article class="mb mb-item mb-item--default[^"]*"[^>]*>.*?</article>', page[h1:] if h1 >= 0 else "", re.S)
        fresh = 0
        for a in arts:
            m = re.search(r'href="(/livres/(\d+)-[^"/]+/)"', a)
            if not m or m.group(2) in seen: continue
            seen.add(m.group(2)); fresh += 1
            e = EAN.search(a)
            title = txt((re.search(r'class="txt-bold">(.*?)</div>', a, re.S) or re.search(r'class="card-title">(.*?)</h3>', a, re.S) or [None, ""])[1])
            cat = txt((re.search(r'class="category[^"]*">(.*?)</a>', a, re.S) or [None, ""])[1])
            if SKIP_TITLE.search(title) or re.search(r"jeux|activit|coloriage|autocollant", cat, re.I): continue
            bid = ("ed:" + e.group(0)) if e else f"ed:{source}:{m.group(2)}"
            cover = (re.search(r'(https://imagine\.bayard\.io/[^"]+\.jpg)', a) or [None, ""])[1]
            la = txt((re.search(r'class="livre-item__description description">(.*?)</div>', a, re.S) or [None, ""])[1])
            todo.append((bid, base + m.group(1), f"{source}-{m.group(2)}", {"title": title, "cat": cat, "cover": cover, "url": base + m.group(1),
                                                                         "authors": [" ".join(w.title() if w.isupper() and len(w) > 2 else w for w in x.split()) for x in la.split(",") if x.strip()]}))
        if not fresh: break

    def parse(page, h):
        q = re.sub(r"\s+", " ", page)
        d = editeurs.iso(txt((re.search(r"Date de parution\s*</div>(.*?)</div>", q) or re.search(r"Date de parution(.{0,200})", q) or [None, ""])[1]))
        if not d: return None
        e = EAN.search((re.search(r"N°\s?EAN(.{0,300})", q) or [None, ""])[1])
        authors = [txt(x) for x in re.findall(r">\s*Auteur\s*</div>\s*(?:<[^>]+>\s*)*([^<]+)<", q)]
        coll = html.unescape((re.search(r'href="/livres/collections/[^"]+"[^>]*title="Voir ([^"]+)"', q) or [None, ""])[1])
        if re.search(r"jeux et jouets|^jeu ", coll + "|" + h["title"], re.I) or re.match(r"jeu ", h["title"], re.I): return None
        authors = authors or h["authors"]
        pages = (re.search(r"Nombre de pages\s*</div>\s*(?:<[^>]+>\s*)*(\d+)", q) or [None, 0])[1]
        k = kind_of(h["cat"], coll)
        if k in ("", "roman"): k = "jeunesse"
        cover = h["cover"].replace("/unsafe/182x0/", "/unsafe/400x0/").replace("/unsafe/268x0/", "/unsafe/400x0/")
        return book(source, publisher, h["title"] or og(page, "title"), d, e.group(0) if e else "", authors, cover, h["url"], k,
                    [x for x in (h["cat"], coll) if x], "", pages, og(page, "description"), slug=h["url"].rstrip("/").rsplit("/", 1)[-1])
    return from_fiches(c, source, todo, parse)


SOURCES = [("michellafon", src_michellafon), ("jailu", src_jailu), ("bragelonne", src_bragelonne),
           # harpercollins : liste remplie par un service tiers (Algolia) ; on ne s'en sert pas
           ("albinmichel", src_albinmichel), ("hugo", src_hugo), ("points", src_points),
           ("bayard", lambda c: src_bayard_milan(c, "bayard")), ("milan", lambda c: src_bayard_milan(c, "milan"))]


def collect(lo, hi, fetch, deadline):
    """lo, hi : 'AAAA-MM-JJ'. fetch : editeurs.Fetcher. Renvoie ({id: livre}, {source: stats})."""
    c, books, stats = Ctx(lo, hi, fetch, deadline), {}, {}
    for name, fn in SOURCES:
        t0, e0, p0 = time.time(), fetch.errors, c.pages
        if c.late():
            stats[name] = {"pages": 0, "livres": 0, "secondes": 0, "erreurs": 0, "note": "échéance atteinte"}; continue
        try: got = fn(c)
        except Exception as e:
            print(f"  {name} : {e}", file=sys.stderr)
            got = {"__erreur__": str(e)[:200]}
        err = got.pop("__erreur__", None) if isinstance(got.get("__erreur__"), str) else None
        stats[name] = {"pages": c.pages - p0, "livres": len(got), "secondes": round(time.time() - t0), "erreurs": fetch.errors - e0 + bool(err)}
        if err: stats[name]["note"] = "erreur : " + err
        if c.cut: stats[name]["incomplet"] = True  # coupé par la limite de temps
        for k, b in got.items(): books.setdefault(k, b)
    return books, stats
