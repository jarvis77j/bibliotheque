#!/usr/bin/env python3
"""Sorties de livres lues directement chez les éditeurs (appelé par sorties.py une fois par jour).

Sources (pages publiques, autorisées par robots.txt au 21/10/2026, aucune requête sur un chemin interdit) :
  hachette  hachette.fr  /nouveautes/N/ (passé, tri date décroissante) + /paraitre/N/ (à paraître, tri croissant)
            → toutes les maisons Hachette Livre : Le Livre de Poche, Pika, Calmann-Lévy, Grasset, Fayard, Stock,
              JC Lattès, BMR, Hachette Romans, Le Masque, Larousse, Dunod, Marabout…  (~24 livres / page)
  glenat    glenat.com   /catalogue/N/ (tout le catalogue, tri date décroissante, à paraître en tête) (~16 / page)
  seuil     seuil.com    /catalogue/a-paraitre?p=N + /catalogue/nouveautes?p=N (16 / page, couvertures en clair)

Sortie : mêmes champs que data/sorties.json (id, title, authors, publisher, date, isbn, pages, format, cover,
description, rayons, url, kind) + "source": "editeur:<nom>".

Usage :
  python3 editeurs.py                      # les 3 sources, écrit editeurs.json à côté du script
  python3 editeurs.py --only glenat --out x.json --delay 3
  python3 editeurs.py --fixtures DIR       # hors ligne : lit DIR/<source>-<n>.html au lieu du réseau (tests)
  python3 editeurs.py --details 40         # lit aussi jusqu'à 40 fiches Hachette sans couverture (og:image, résumé)

Bibliothèque standard uniquement. User-Agent honnête, une requête à la fois, délai entre deux pages.
"""
import argparse, difflib, gzip, html, json, os, re, sys, time, unicodedata, urllib.request
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser

UA = "Mozilla/5.0 (compatible; MaBibliothequeBot/1.0; +https://jarvis77j.github.io/bibliotheque/)"
EAN_RE = re.compile(r"(97[89]\d{10})")
DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
MONTHS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split())}
DATE_FR_RE = re.compile(r"\b(\d{1,2})(?:er)? (" + "|".join(MONTHS) + r") (\d{4})\b", re.I)

SOURCES = {
    # nom : (base, [(modèle d'URL de page, sens du tri)], motif des liens de fiche)
    "hachette": ("https://www.hachette.fr", [("/nouveautes/{n}/", "desc"), ("/paraitre/{n}/", "asc")], r"^/livre/[^/]+-97[89]\d{10}/?$"),
    "glenat":   ("https://www.glenat.com",  [("/catalogue/{n}/", "desc")], r"^/[a-z0-9-]+/[^/]+-97[89]\d{10}/?$"),
    "seuil":    ("https://www.seuil.com",   [("/catalogue/a-paraitre?p={n}", "asc"), ("/catalogue/nouveautes?p={n}", "desc")], r"^/ouvrage/[^/]+/97[89]\d{10}/?$"),
}
FIRST_PAGE = {"/nouveautes/{n}/": "/nouveautes/", "/paraitre/{n}/": "/a-paraitre/", "/catalogue/{n}/": "/catalogue/"}

# éléments qui ne sont pas des livres papier pour l'onglet Sorties
SKIP_PUBLISHERS = {"audiolib"}
SKIP_TITLE_RE = re.compile(r"\bchapitre \d+|^revue |^annales de |\bn° \d+\b|calendrier 20\d\d", re.I)
KINDS = [(("manga", "pika", "mangetsu", "nobi nobi", "kana", "glénat manga", "shonen", "seinen", "shojo"), "bd"),
         (("bd", "bande dessinée", "bandes dessinées", "comics", "roman graphique"), "bd"),
         (("romance", "bmr", "new romance", "hlab", "sentimental"), "romance"),
         (("young adult", "jeunes adultes", "ya", "hachette romans", "rageot"), "ya"),
         (("imaginaire", "fantasy", "fantastique", "science-fiction", "sf"), "fantasy"),
         (("polar", "policier", "thriller", "le masque", "suspense", "roman noir"), "policier"),
         (("jeunesse", "petite enfance", "albums", "deux coqs d'or", "gautier languereau", "hachette enfants"), "jeunesse"),
         (("roman", "littérature", "nouvelles", "le livre de poche", "grasset", "stock", "calmann", "lattès", "fayard"), "roman")]
STATUS = {"a paraitre", "nouveaute", "nouveau", "precommande", "en precommande", "prochainement", "exclusivite", "a la une"}
NOT_TEXT = {"couverture de produit indisponible", "remove_red_eye_outlined", "visuel non disponible", "headphones"}


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


class Stream(HTMLParser):
    """Aplatit la page en événements : ('a', href) / ('/a',) / ('img', src, alt) / ('t', texte, balise_titre)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ev, self.heading, self.skip = [], 0, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"): self.skip += 1
        elif tag == "a": self.ev.append(("a", a.get("href") or ""))
        elif tag == "img" or tag == "source":
            src = a.get("data-src") or a.get("src") or (a.get("data-srcset") or a.get("srcset") or "").split(" ")[0]
            self.ev.append(("img", src or "", a.get("alt") or ""))
        elif tag in ("h1", "h2", "h3", "h4"): self.heading += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"): self.skip = max(0, self.skip - 1)
        elif tag == "a": self.ev.append(("/a",))
        elif tag in ("h1", "h2", "h3", "h4"): self.heading = max(0, self.heading - 1)

    def handle_data(self, data):
        t = re.sub(r"\s+", " ", data).strip()
        if t and not self.skip: self.ev.append(("t", t, self.heading > 0))


def iso(d):
    m = DATE_RE.search(d)
    if m: return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = DATE_FR_RE.search(d)
    return f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}" if m else ""


COVER_RES = [re.compile(r"https://www\.images\.hachette-livre\.fr/media/imgArticle/[A-Z0-9_-]+/\d{4}/(97[89]\d{10})-001-X\.jpe?g"),
             re.compile(r"https://ref\.lamartinieregroupe\.com/media/(97[89]\d{10})/grande/[^\"' ]+?\.jpg")]
def cover_map(page):
    out = {}
    for r in COVER_RES:
        for m in r.finditer(page): out.setdefault(m.group(1), m.group(0))
    return out

# Hachette : le JSON de la page donne pour chaque EAN le type de produit et le rayon (fil d'Ariane)
SKIP_TYPES = ("Fichier audio", "Fichier (ebook", "Jeux, articles de papeterie", "Calendrier", "Contenant")
SKIP_RAYONS = {"loisirs", "cuisine", "sante bien etre", "guides", "famille", "jeux et jouets", "scolaire et parascolaire",
               "informatique et management", "medecine", "vins et spiritueux", "bricolage", "coloriage", "gastronomie",
               "auto moto", "vie pratique et loisirs", "cuisine et vins", "sante bien etre et sports", "tourisme et voyages"}
RAYON_KINDS = [(("mangas", "bd mangas", "ito", "bande dessinee", "bandes dessinees", "comics"), "bd"),
               (("litterature sentimentale", "romance", "new romance", "yra"), "romance"),
               (("fantasy", "science fiction", "fantastique", "fantasy et science fiction"), "fantasy"),
               (("thriller", "polar", "policier", "fayard noir", "policiers"), "policier"),
               (("ados",), "ya"),
               (("eveil 0 3 ans", "albums et illustres 3 6 ans", "premieres lectures 6 9 ans", "premieres encyclopedies",
                 "petite enfance", "jeunesse"), "jeunesse"),
               (("romans francophones", "romans etrangers", "romans et nouvelles de genre", "oeuvres classiques"), "roman")]
NOT_ROMAN = {"essais", "actualites", "biographies memoires", "histoire et actualites", "savoirs", "arts", "beaux livres"}

def _unesc(s):
    try: return json.loads('"' + s.replace('\\\\', '\\') + '"')
    except Exception: return s

def hachette_meta(page):
    """{ean: (type de produit, [rayons du fil d'Ariane])} lus dans le JSON embarqué des pages Hachette."""
    out, parts = {}, re.split(r'\\"ean\\":\\"(97[89]\d{10})\\"', page)
    for i in range(1, len(parts), 2):
        ean, chunk = parts[i], parts[i + 1][:6000]
        if ean in out: continue
        t = re.search(r'\\"type_de_produit\\":\\"((?:[^"\\]|\\\\u[0-9a-f]{4})*)\\"', chunk)
        bc = re.search(r'\\"breadcrumb\\":\[(.*?)\]', chunk)
        crumbs = [_unesc(n) for n in re.findall(r'\\"name\\":\\"((?:[^"\\]|\\\\u[0-9a-f]{4}|\\\\/)*)\\"', bc.group(1))] if bc else []
        out[ean] = (_unesc(t.group(1)) if t else "", crumbs)
    return out

def rayon_kind(crumbs):
    ns = [norm(c) for c in crumbs]
    if any(n in NOT_ROMAN for n in ns[:1]): return None  # rayon connu, mais pas un roman : pas de genre forcé
    for words, k in RAYON_KINDS:
        if any(n in words for n in ns): return k
    return ""

# maisons hors du public de l'app (scolaire, universitaire, professionnel)
SKIP_PUBS = {"dunod", "hachette education", "armand colin", "hachette fle", "hatier", "foucher", "ediser", "istra"}

def parse_list(page, base, product_re, source):
    """Découpe la page en fiches : chaque nouveau lien vers une fiche (EAN neuf) ouvre une fiche ;
    tout ce qui suit jusqu'à la fiche suivante (textes, images, liens éditeur/auteur) lui appartient."""
    p = Stream(); p.feed(page)
    prod = re.compile(product_re)
    cards, cur, href_stack = [], None, []
    for e in p.ev:
        if e[0] == "a":
            href = html.unescape(e[1]).replace(base, "")
            path = href.split("#")[0]
            href_stack.append(path)
            if prod.match(path.split("?")[0]):
                ean = EAN_RE.search(path).group(1)
                if not cur or cur["isbn"] != ean:  # chaque apparition est une carte ; on garde la première lisible
                    cur = {"isbn": ean, "path": path, "texts": [], "imgs": []}
                    cards.append(cur)
        elif e[0] == "/a":
            if href_stack: href_stack.pop()
        elif cur is None:
            continue
        elif e[0] == "img":
            cur["imgs"].append((e[1], e[2]))
        elif e[0] == "t":
            in_link = href_stack[-1] if href_stack else ""
            cur["texts"].append((e[1], e[2], in_link))
    out, covers, seen = [], cover_map(page), set()
    meta = hachette_meta(page) if source == "hachette" else {}
    for c in cards:
        b = card_to_book(c, base, source)
        if not b or b["isbn"] in seen or norm(b["publisher"]) in SKIP_PUBS: continue
        seen.add(b["isbn"])
        typ, crumbs = meta.get(b["isbn"], ("", []))
        if typ.startswith(SKIP_TYPES) or any(norm(r) in SKIP_RAYONS for r in crumbs): continue
        if typ: b["format"] = typ
        if crumbs:
            b["rayons"] = crumbs[:3]
            k = rayon_kind(crumbs)
            if k is None: b["kind"] = "" if b["kind"] == "roman" else b["kind"]
            elif k: b["kind"] = k
        if not b["cover"] or "placeholder" in b["cover"]: b["cover"] = covers.get(b["isbn"], "")
        out.append(b)
    return out


def card_to_book(c, base, source):
    texts = [(t, h, l) for t, h, l in c["texts"] if norm(t) not in {norm(x) for x in NOT_TEXT}]
    d, di = "", -1
    for i, (t, _, _) in enumerate(texts):
        d = iso(t)
        if d: di = i; break
    if not d: return None
    if any(norm(t) == "a la une" for t, _, _ in texts[:di]): return None  # bloc mis en avant, hors liste datée
    slug = norm(re.sub(r"[-/]97[89]\d{10}.*$", "", c["path"]).rsplit("/", 1)[-1].replace("-", " "))
    before = texts[:di]
    # titre : un intertitre s'il y en a un, sinon le texte qui ressemble le plus au slug de l'URL
    heads = [t for t, h, _ in before if h]
    alt = next((a for _, a in c["imgs"] if a and norm(a) not in {norm(x) for x in NOT_TEXT}), "")
    def score(t):  # ressemblance avec le slug, espaces ôtés (« L'univers » -> « lunivers »)
        return difflib.SequenceMatcher(None, norm(t).replace(" ", ""), slug.replace(" ", "")).ratio()
    cands = [t for t, _, _ in before if norm(t) not in STATUS]
    title = heads[0] if heads else (max(cands, key=score) if cands and score(max(cands, key=score)) > 0.3 else (alt or (cands[1] if len(cands) > 1 else "")))
    title = re.sub(r"^Couverture (du livre |de )?", "", title).strip()
    if not title: return None
    ti = next((i for i, (t, _, _) in enumerate(before) if t == title), -1)
    rest = [t for t, _, _ in before[ti + 1:]] if ti >= 0 else []
    # « Olivier Berné, Thomas Carpentier » ou un lien par auteur ; le texte de la ligne date peut aussi porter l'auteur
    authors = []
    for t in rest:
        authors += [a.strip() for a in re.split(r",| et ", t) if a.strip()]
    if not authors and ti < 0:
        authors = [t for t, _, l in before if "auteur" in l.lower()]
    cats = [t for t, _, _ in before[:max(ti, 0)] if norm(t) not in STATUS]
    after = texts[di + 1:di + 3]
    publisher = {"hachette": "", "glenat": "Glénat", "seuil": "Seuil"}[source]
    if source == "hachette":  # lien de la maison juste après la carte : /livres-<maison>/
        publisher = next((t for t, _, l in after if l.startswith("/livres-") or "editeur" in l), "")
    if source == "glenat":
        coll = re.match(r"^/([a-z0-9-]+)/", c["path"])
        if coll and "manga" in coll.group(1): publisher = "Glénat Manga"
        elif coll and "jeunesse" in coll.group(1): publisher = "Glénat Jeunesse"
    cover = next((s for s, _ in c["imgs"] if s and not re.search(r"logo|placeholder|default|indisponible|\.svg", s)), "")
    if cover.startswith("//"): cover = "https:" + cover
    elif cover.startswith("/"): cover = base + cover
    if SKIP_TITLE_RE.search(title) or norm(publisher) in SKIP_PUBLISHERS: return None
    hay = " ".join([title, publisher, c["path"]] + cats).lower()
    kind = next((k for words, k in KINDS if any(re.search(r"(^|\W)" + re.escape(w) + r"($|\W)", hay) for w in words)), "")
    return {
        "id": f"ed:{c['isbn']}", "title": title, "authors": list(dict.fromkeys(authors))[:3], "publisher": publisher,
        "date": d, "isbn": c["isbn"], "pages": 0, "format": "", "cover": cover, "description": "",
        "rayons": cats[:3], "url": base + c["path"], "kind": kind, "source": "editeur:" + source,
    }


# ---- même livre lu sur deux sites sans ISBN commun (Nautiljon / Kana, bdgest / libraire…) : titre + date
ED_MARKS = re.compile(r"\b(collector|limitee|deluxe|coffret|speciale|prestige|reliee|integrale|nb|noir et blanc|noir blanc|"
                      r"luxe|variant|monarque|gourmande|perfect|double|poche|grand format|originale)\b")

def title_keys(b):
    """(clé exacte, clé série+tome) : « One Piece - Tome 112 », « One Piece T112 - Le titre » -> onepiecet112.
    La clé courte garde les mentions d'édition (collector, intégrale…) pour ne pas mêler deux éditions."""
    t = norm(b.get("title", ""))
    t = re.sub(r"\b(?:tome|vol|volume|t)\s*0*(\d+)\b", r"t\1", t)
    t = re.sub(r"^(?:l|le|la|les|the|un|une) ", "", t)
    m = re.match(r"(.*?\bt\d+)\b(.*)$", t)
    short = (m.group(1) + "".join(sorted(set(ED_MARKS.findall(m.group(2)))))) if m else t
    return t.replace(" ", ""), short.replace(" ", "")

def dedupe(books):
    """Fusionne les fiches d'un même livre (même date, même titre, ISBN égaux ou absents d'un côté).
    Garde la plus complète (ISBN, résumé, couverture) et y reporte ce qui lui manque. Renvoie la liste."""
    def score(b):
        return (8 if b.get("isbn") else 0) + (4 if b.get("description") else 0) + (2 if b.get("cover") else 0) + (1 if b.get("authors") else 0)
    kept, index = [], {}
    for b in sorted(books, key=score, reverse=True):
        same = None
        for k in title_keys(b):
            for a in index.get((k, b.get("date", "")), []):
                if not a.get("isbn") or not b.get("isbn") or a["isbn"] == b["isbn"]: same = a; break
            if same: break
        if same:
            for f in ("authors", "cover", "description", "isbn", "kind", "rayons"):
                if not same.get(f) and b.get(f): same[f] = b[f]
            continue
        kept.append(b)
        for k in title_keys(b): index.setdefault((k, b.get("date", "")), []).append(b)
    return kept


class Fetcher:
    def __init__(self, delay, fixtures=None):
        self.delay, self.fixtures, self.last, self.n, self.bytes, self.errors = delay, fixtures, 0.0, 0, 0, 0
        self.robots = {}

    def allowed(self, url):
        """Respecte robots.txt du site (lu une fois). Site sans robots.txt (404) : permis ; illisible : refusé."""
        if self.fixtures: return True
        import urllib.robotparser
        root = "/".join(url.split("/")[:3])
        if root not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                req = urllib.request.Request(root + "/robots.txt", headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=20) as r:
                    rp.parse(r.read().decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                rp.parse([] if e.code in (404, 410) else ["User-agent: *", "Disallow: /"])
            except Exception:
                rp.parse(["User-agent: *", "Disallow: /"])
            self.robots[root] = rp
        return self.robots[root].can_fetch(UA, url)

    def get(self, url, key):
        if self.fixtures:
            f = os.path.join(self.fixtures, key + ".html")
            self.n += 1
            return open(f, encoding="utf-8").read() if os.path.exists(f) else ""
        if not self.allowed(url):
            print(f"  interdit par robots.txt : {url}", file=sys.stderr); return ""
        wait = self.delay - (time.time() - self.last)
        if wait > 0: time.sleep(wait)
        self.last = time.time(); self.n += 1
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr", "Accept-Encoding": "gzip"})
        for essai in (1, 2):  # une seconde chance après une petite pause
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read(); self.bytes += len(data)
                    if r.headers.get("Content-Encoding") == "gzip": data = gzip.decompress(data)
                    return data.decode("utf-8", "replace")
            except Exception as e:
                if essai == 1 and not (getattr(e, "code", 0) in (403, 404, 410)):
                    time.sleep(10); continue
                self.errors += 1
                print(f"  échec {url} : {e}", file=sys.stderr)
                return ""


def crawl(source, fetch, lo, hi, max_pages=100, deadline=None):
    base, lists, product_re = SOURCES[source]
    books, pages = {}, 0
    for tpl, order in lists:
        seen_prev = None
        for n in range(1, max_pages + 1):
            if deadline and time.time() > deadline: break  # garde-fou : le robot ne doit pas tourner des heures
            path = FIRST_PAGE.get(tpl, tpl.format(n=n)) if n == 1 else tpl.format(n=n)
            page = fetch.get(base + path, f"{source}-{re.sub(r'[^a-z]+', '', tpl.replace('{n}', ''))}-{n}")
            pages += 1
            got = parse_list(page, base, product_re, source) if page else []
            keys = {b["isbn"] for b in got}
            if not got or keys == seen_prev: break  # fin de liste (ou le site renvoie la même page)
            pinned = keys & (seen_prev or set())  # fiches épinglées répétées sur chaque page : ne comptent pas pour la date
            seen_prev = keys
            for b in got:
                if lo <= b["date"] <= hi: books.setdefault(b["isbn"], b)
            ds = sorted(b["date"] for b in got if b["isbn"] not in pinned) or sorted(b["date"] for b in got)
            if order == "desc" and ds[-1] < lo: break   # on est passé sous la fenêtre
            if order == "asc" and ds[0] > hi: break     # au-delà de l'horizon
    return books, pages


def details(fetch, books, n):
    """Fiche Hachette : og:image (couverture) et og:description (début du résumé)."""
    done = 0
    for b in books.values():
        if done >= n: break
        if b["cover"] or not b["source"].endswith("hachette"): continue
        page = fetch.get(b["url"], "detail-" + b["isbn"]); done += 1
        m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', page)
        if m and "indisponible" not in m.group(1): b["cover"] = html.unescape(m.group(1))
        m = re.search(r'<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"', page)
        if m: b["description"] = html.unescape(m.group(1))[:1500]
    return done


MODULES = [("src_manga", 8), ("src_bd", 8), ("src_generale", 10)]  # (module, minutes au plus)

def collect(lo, hi, delay=3.0, only="hachette,glenat,seuil", end=None):
    """Pour sorties.py : renvoie ({isbn ou id: livre}, stats). end : heure limite de toute la récolte
    (par défaut dans 28 minutes). Une source coupée par la limite est marquée "incomplet" : sorties.py garde
    alors ses anciennes fiches au lieu de les remplacer par une liste tronquée."""
    fetch, allb, stats = Fetcher(delay), {}, {}
    end = end or time.time() + 28 * 60
    deadline = min(end, time.time() + 12 * 60)
    for s in only.split(","):
        t0, e0 = time.time(), fetch.errors
        try: got, pages = crawl(s, fetch, lo, hi, deadline=deadline)
        except Exception as e:
            stats[s] = "erreur : " + str(e); continue
        stats[s] = {"pages": pages, "livres": len(got), "secondes": round(time.time() - t0), "erreurs": fetch.errors - e0}
        if time.time() > deadline: stats[s]["incomplet"] = True
        for k, b in got.items(): allb.setdefault(k, b)
    # autres sources (chacune dans son module, avec sa propre limite de temps)
    for mod, minutes in MODULES:
        dl = min(end, time.time() + minutes * 60)
        try:
            m = __import__(mod)
            got, st = m.collect(lo, hi, fetch, dl)
        except Exception as e:
            stats[mod] = "erreur : " + str(e)[:200]; continue
        stats.update(st)
        for b in got.values():
            k = b.get("isbn") or b["id"]
            if k in allb:  # même livre chez deux sources : on complète la première fiche
                a = allb[k]
                for f in ("authors", "cover", "description", "kind"):
                    if not a.get(f) and b.get(f): a[f] = b[f]
            else:
                allb[k] = b
    stats["erreurs"] = fetch.errors
    return allb, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="hachette,glenat,seuil")
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "editeurs.json"))
    ap.add_argument("--fixtures")
    ap.add_argument("--details", type=int, default=0)
    ap.add_argument("--today", default=date.today().isoformat())
    a = ap.parse_args()
    t = date.fromisoformat(a.today)
    m2 = (t.month - 3) % 12 + 1
    lo = date(t.year - (1 if t.month <= 2 else 0), m2, 1).isoformat()   # même fenêtre que scripts/sorties.py
    hi = (t + timedelta(days=186)).isoformat()
    fetch = Fetcher(a.delay, a.fixtures)
    allb, stats = {}, {}
    for s in a.only.split(","):
        t0, n0 = time.time(), fetch.n
        got, pages = crawl(s, fetch, lo, hi)
        months = {}
        for b in got.values(): months[b["date"][:7]] = months.get(b["date"][:7], 0) + 1
        stats[s] = {"pages": pages, "requetes": fetch.n - n0, "livres": len(got), "par_mois": dict(sorted(months.items())),
                    "secondes": round(time.time() - t0, 1), "plus_loin": max((b["date"] for b in got.values()), default="")}
        print(s, json.dumps(stats[s], ensure_ascii=False), file=sys.stderr)
        for k, b in got.items(): allb.setdefault(k, b)
    if a.details: stats["fiches_lues"] = details(fetch, allb, a.details)
    stats.update(requetes=fetch.n, octets=fetch.bytes, erreurs=fetch.errors)
    keep = sorted(allb.values(), key=lambda b: (b["date"], b["title"]))
    json.dump({"source": "editeurs", "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "stats": stats, "books": keep},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(len(keep), "livres écrits dans", a.out, file=sys.stderr)


if __name__ == "__main__":
    main()
