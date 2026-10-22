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
import argparse, difflib, html, json, os, re, sys, time, unicodedata, urllib.request
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
NOT_TEXT = {"couverture de produit indisponible", "remove_red_eye_outlined", "visuel non disponible"}


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
                if not cur or cur["isbn"] != ean:
                    if any(c["isbn"] == ean for c in cards):  # lien répété plus bas (ex. bloc « à la une ») : on ignore
                        cur = {"isbn": ean, "dup": True, "texts": [], "imgs": [], "path": path}
                    else:
                        cur = {"isbn": ean, "path": path, "texts": [], "imgs": [], "links": []}
                        cards.append(cur)
        elif e[0] == "/a":
            if href_stack: href_stack.pop()
        elif cur is None or cur.get("dup"):
            continue
        elif e[0] == "img":
            cur["imgs"].append((e[1], e[2]))
        elif e[0] == "t":
            in_link = href_stack[-1] if href_stack else ""
            cur["texts"].append((e[1], e[2], in_link))
    out, covers = [], cover_map(page)
    for c in cards:
        b = card_to_book(c, base, source)
        if not b or norm(b["publisher"]) in SKIP_PUBS: continue
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
    if any(norm(t) == "a la une" for t, _, _ in texts): return None  # bloc mis en avant, hors liste datée
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


class Fetcher:
    def __init__(self, delay, fixtures=None):
        self.delay, self.fixtures, self.last, self.n, self.bytes, self.errors = delay, fixtures, 0.0, 0, 0, 0

    def get(self, url, key):
        if self.fixtures:
            f = os.path.join(self.fixtures, key + ".html")
            self.n += 1
            return open(f, encoding="utf-8").read() if os.path.exists(f) else ""
        wait = self.delay - (time.time() - self.last)
        if wait > 0: time.sleep(wait)
        self.last = time.time(); self.n += 1
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read(); self.bytes += len(data)
                return data.decode("utf-8", "replace")
        except Exception as e:
            self.errors += 1
            print(f"  échec {url} : {e}", file=sys.stderr)
            return ""


def crawl(source, fetch, lo, hi, max_pages=150):
    base, lists, product_re = SOURCES[source]
    books, pages = {}, 0
    for tpl, order in lists:
        seen_prev = None
        for n in range(1, max_pages + 1):
            path = FIRST_PAGE.get(tpl, tpl.format(n=n)) if n == 1 else tpl.format(n=n)
            page = fetch.get(base + path, f"{source}-{re.sub(r'[^a-z]+', '', tpl.replace('{n}', ''))}-{n}")
            pages += 1
            got = parse_list(page, base, product_re, source) if page else []
            keys = {b["isbn"] for b in got}
            if not got or keys == seen_prev: break  # fin de liste (ou le site renvoie la même page)
            seen_prev = keys
            for b in got:
                if lo <= b["date"] <= hi: books.setdefault(b["isbn"], b)
            ds = sorted(b["date"] for b in got)
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


def collect(lo, hi, delay=3.0, only="hachette,glenat,seuil"):
    """Pour sorties.py : renvoie ({isbn: livre}, stats)."""
    fetch, allb, stats = Fetcher(delay), {}, {}
    for s in only.split(","):
        t0 = time.time()
        try: got, pages = crawl(s, fetch, lo, hi)
        except Exception as e:
            stats[s] = "erreur : " + str(e); continue
        stats[s] = {"pages": pages, "livres": len(got), "secondes": round(time.time() - t0)}
        for k, b in got.items(): allb.setdefault(k, b)
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
