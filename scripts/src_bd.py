#!/usr/bin/env python3
"""Sorties BD franco-belges et comics (+ mangas des éditeurs BD qui en publient) pour l'onglet Sorties.

Pages lues (toutes autorisées par robots.txt au 22/10/2026 ; aucune fiche bedetheque « /fiche* ») :
  bdgest      bdgest.com/sorties_bd et /sorties_comics ?DL=MM%2FAAAA&vue=liste : calendrier du mois, jour exact,
              éditeur, série #tome, titre, auteurs (noms), couverture bedetheque. Pas d'ISBN.  2 pages / mois.
  bedetheque  quelques fiches album bedetheque.com/BD-…-<id>.html (EAN), pour les sorties proches sans ISBN.
  dargaud     dargaud.com/bd-a-paraitre/MM-AAAA : à paraître avec date ; les mois passés n'ont plus de date
              (servent seulement à compléter ISBN/couverture/auteurs des fiches bdgest).
  delcourt    editions-delcourt.fr/<rayon>/a-paraitre-… et /nouveautes-… (bd, comics, jeunesse, mangas, kbooks)
  soleil      editions-soleil.fr, mêmes listes (pages de ~800 ko, cartes dans le HTML, 18 par page, ?page=N)
  lombard     lelombard.com/bd/nouveautes, /p2… (mois groupés, date exacte, tri décroissant)
  kana        kana.fr/planning/?month_nb=M&year_nb=AAAA (jour exact ; EAN seulement si la couverture existe)
  casterman   casterman.com/ (accueil : carrousels nouveautés / à paraître BD et jeunesse ; les listes
              « (parution) » sont interdites par robots.txt)
  ruedesevres editions-ruedesevres.fr/catalogue (tout le catalogue ; date seulement pour « A paraître le »)
  dupuis      dupuis.com/catalogue/FR/parutions.html (mois en cours, sans jour : complément seulement)

Fusion : chaque fiche bdgest est rapprochée d'une fiche éditeur (série + tome, date proche) pour prendre ISBN,
couverture, auteurs complets et page éditeur ; les fiches éditeur datées non retrouvées dans bdgest sont ajoutées.
Glénat et les maisons Hachette ne sont pas reprises de bdgest (déjà lues avec ISBN par editeurs.py).
"""
import difflib, html, os, re, sys, time
from datetime import date, timedelta

try:
    import editeurs
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bibliotheque", "scripts"))
    sys.path.insert(0, "/home/claude/bibliotheque/scripts")
    import editeurs
norm, MONTHS = editeurs.norm, editeurs.MONTHS

FICHES = 60          # fiches bedetheque lues au plus par passage (sorties proches sans ISBN)
# Cache facultatif {id album bedetheque: EAN, ou "-AAAA-MM-JJ" si lu sans EAN} : chemin dans BD_ISBN_CACHE.
# Sans lui, chaque passage relit les mêmes fiches (les plus proches) ; avec lui, l'ISBN s'accumule de jour en jour.
CACHE_PATH = os.environ.get("BD_ISBN_CACHE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "bd-isbn.json"))


def load_cache():
    try:
        import json
        return json.load(open(CACHE_PATH, encoding="utf-8")) if CACHE_PATH and os.path.exists(CACHE_PATH) else {}
    except Exception:
        return {}


def save_cache(c):
    if not CACHE_PATH: return
    try:
        import json
        json.dump(c, open(CACHE_PATH, "w", encoding="utf-8"), separators=(",", ":"))
    except Exception as e:
        print("  cache bedetheque non écrit :", e, file=sys.stderr)
SKIP_BDGEST_PUBS = re.compile(r"^(glenat|hachette|pika|marabout|marabulles|le livre de poche)\b")
SKIP_RE = re.compile(r"\b(coffret|calendrier|agenda|carnet|papeterie|ex-libris|ex libris|tirage de t[eê]te|"
                     r"puzzle|jeu de cartes|magazine|t-shirt|figurine|portfolio|sérigraphie|affiche)\b", re.I)
ARTICLES = re.compile(r"^(le|la|les|l|the|un|une|des|a)\s+")
EAN_RE = re.compile(r"(97[89]\d{10})")


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\u00ad", "")).strip()


def skey(s):
    """Clé de série : minuscules sans accents, sans article ni précision entre parenthèses."""
    s = norm(re.sub(r"\([^)]*\)", " ", s or ""))
    return ARTICLES.sub("", s).replace(" ", "")


def make_title(series, tome, album):
    if album and norm(album).startswith(norm(series) + " "):  # « URSS 89 - URSS 89 - Les tribulations… »
        album = album[len(series):].lstrip(" -:–,")
    t = series
    if tome: t += f" - Tome {tome}"
    if tome and re.match(r"^tome " + tome + r"( sur \d+| \d+)?$", norm(album)): album = ""  # « Tome 2/4 »
    if album and norm(album) not in (norm(series), norm(f"tome {tome}"), "") and not (tome and norm(album) == tome):
        t += " - " + album
    return t


def months(lo, hi):
    y, m = int(lo[:4]), int(lo[5:7])
    while (y, m) <= (int(hi[:4]), int(hi[5:7])):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def person(n):
    """« Vidal, Roger » -> « Roger Vidal » ; « daniel pecqueur » -> « Daniel Pecqueur »."""
    n = re.sub(r"\s*\(\d+\)$", "", n.strip())
    if "," in n:
        a, b = [x.strip() for x in n.split(",", 1)]
        n = f"{b} {a}" if b else a
    if n and (n == n.lower() or any(w and w == w.lower() for w in n.split()[1:])):
        n = " ".join(w[:1].upper() + w[1:] for w in n.split())
        n = re.sub(r"-(\w)", lambda m: "-" + m.group(1).upper(), n)
    return n


def book(src, isbn, slug, title, authors, publisher, d, cover, url, kind="bd", rayons=()):
    return {"id": f"ed:{isbn}" if isbn else f"ed:{src}:{slug}", "title": title, "authors": list(dict.fromkeys(a for a in authors if a))[:3],
            "publisher": publisher, "date": d, "isbn": isbn or "", "pages": 0, "format": "", "cover": cover or "",
            "description": "", "rayons": list(rayons)[:3], "url": url, "kind": kind, "source": "editeur:" + src}


def rec(src, isbn, series, tome, album, d, cover, authors, url, publisher, kind="bd", title=None, slug=""):
    """Fiche éditeur intermédiaire (date '' = sans jour exact, sert seulement au rapprochement)."""
    tome = str(int(tome)) if tome and str(tome).isdigit() else (tome or "")
    return {"src": src, "isbn": isbn or "", "series": series, "tome": tome, "album": album or "", "date": d or "",
            "cover": cover or "", "authors": authors, "url": url, "publisher": publisher, "kind": kind,
            "title": title or make_title(series, tome, album), "slug": slug or norm(series + " " + tome + " " + (album or "")).replace(" ", "-")}


class Src:
    def __init__(self, name, fetch, deadline):
        self.name, self.fetch, self.deadline = name, fetch, deadline
        self.pages, self.t0, self.e0, self.cut = 0, time.time(), fetch.errors, False

    def get(self, url, key):
        if time.time() > self.deadline: self.cut = True; return ""
        self.pages += 1
        return self.fetch.get(url, key) or ""

    def stats(self, n):
        st = {"pages": self.pages, "livres": n, "secondes": round(time.time() - self.t0), "erreurs": self.fetch.errors - self.e0}
        if self.cut: st["incomplet"] = True  # coupé par la limite de temps : sorties.py garde les anciennes fiches
        return st


# ---------------------------------------------------------------- bdgest
def parse_bdgest(page, y, m, cat):
    can = re.search(r'<link rel="canonical" href="[^"]*DL=(\d\d)%2F(\d{4})', page)
    if not can or (int(can.group(2)), int(can.group(1))) != (y, m): return []  # mois non servi : page par défaut
    out = []
    for sec in re.split(r'<section class="bdg-cal-day"', page)[1:]:
        j = re.match(r'\s*id="j(\d\d)(\d\d)(\d{4})?"', sec)
        if not j: continue
        yy = int(j.group(3) or y)
        if yy > 2090: continue  # « date inconnue »
        d = f"{yy}-{j.group(2)}-{j.group(1)}"
        for aid, nom, body in re.findall(r'<li data-album="(\d+)" data-nom="([^"]*)">(.*?)</li>', sec, re.S):
            a = re.search(r'<div class="t">\s*<a href="([^"]+)"', body)
            ti = re.search(r'<small class="ti">(.*?)</small>', body, re.S)
            smalls = [clean(s) for c, s in re.findall(r'<small( class="ti")?>(.*?)</small>', body, re.S) if not c]
            ed = re.search(r'class="ed">([^<]*)', body)
            img = re.search(r'<img src="(https://www\.bedetheque\.com/cache/thb_couv/[^"]+)"', body)
            nom = clean(nom)
            mt = re.match(r"^(.*?)\s*(?:#(\S+)|\bINT\.?\s*(\d+))$", nom)
            series, tome = (mt.group(1), mt.group(2) or "") if mt else (nom, "")
            if mt and mt.group(3): series, tome = series + " Intégrale", mt.group(3)
            album = clean(ti.group(1)) if ti else ""
            if tome and not tome.isdigit():  # « #HS3 », « #2026 » : code repris dans la série puis décodé
                series, tome = f"{series} {tome}", ""
            auteur_serie = re.match(r"^\((AUT|DOC|HS)\)\s*", series)
            series = re.sub(r"^\([A-Z]+\)\s*", "", series).strip()
            series = re.sub(r"\s+INT\.?$", " Intégrale", series)
            code = re.match(r"^(.*?)\s+(HS|Poche|Audio|INT|c)\s*(\d+)$", series)  # codes bedetheque : HS3, Poche7, c2026…
            if code:
                if code.group(2) == "Audio": continue  # livre audio
                series = code.group(1) + {"HS": " Hors-série", "INT": " Intégrale"}.get(code.group(2), "")
                if code.group(2) != "c" and len(code.group(3)) < 4 and not tome: tome = code.group(3)
            tome = str(int(tome)) if tome.isdigit() else ""
            disp_series = re.sub(r"\s*\([^)]*\)", "", series).strip()  # « Burnout (Hachin) » -> « Burnout »
            title = album if auteur_serie and album else make_title(disp_series, tome, album)
            authors = [person(x) for x in re.split(r"\s*/\s*", smalls[-1])] if smalls else []
            out.append({"aid": aid, "series": disp_series, "tome": str(int(tome)) if tome.isdigit() else "", "album": album,
                        "title": title, "date": d, "publisher": clean(ed.group(1)) if ed else "",
                        "cover": re.sub(r"/cache/thb_couv/(Couv_\d+\.jpg)$", r"/media/Couvertures/\1", img.group(1)) if img else "",  # grande couverture (celle des fiches) ; vignette sinon
                        "authors": authors,
                        "url": a.group(1) if a else f"https://www.bdgest.com/sorties_{cat}", "cat": cat})
    return out


def collect_bdgest(src, lo, hi):
    got, empty = [], 0
    now = (date.today().year, date.today().month)
    for y, m in months(lo, hi):
        n0 = len(got)
        for cat in ("bd", "comics"):
            page = src.get(f"https://www.bdgest.com/sorties_{cat}?DL={m:02d}%2F{y}&vue=liste", f"bdgest-{cat}-{y}-{m:02d}")
            got += parse_bdgest(page, y, m, cat) if page else []
        empty = empty + 1 if len(got) == n0 and (y, m) > now else 0
        if empty >= 2: break  # calendrier pas encore rempli au-delà
    return [g for g in got if lo <= g["date"] <= hi and not SKIP_BDGEST_PUBS.match(norm(g["publisher"]))
            and not SKIP_RE.search(g["title"])]


# ---------------------------------------------------------------- éditeurs
def parse_dargaud(page):
    out = []
    for a in re.findall(r'<article class="card-album.*?</article>', page, re.S):
        img = re.search(r'bdi\.dlpdomain\.com/album/(97[89]\d{10})/couv/[^/]+/([a-z0-9-]+)\.jpe?g', a)
        if not img: continue
        cover = re.search(r'<img src="([^"]+)"', a).group(1)
        series = clean(re.search(r'card-album__title[^>]*>(.*?)</span>', a, re.S).group(1))
        tm = re.search(r'>\s*Tome\s+(\d+)\s*<', a) or re.search(r"-tome-(\d+)(?:-|$)", img.group(2))
        tome = tm.group(1) if tm else ""
        slug = img.group(2)
        album = ""  # le titre d'album n'existe que sans accents (nom d'image) : on s'en passe
        t = re.search(r'<time datetime="(\d{4}-\d\d-\d\d)', a)
        authors = []
        for role, names in re.findall(r'<p class="fs-12">\s*(Auteur|Scénario|Dessin)\s*:\s*([^<]+)</p>', a):
            authors += [n.strip() for n in names.split(",")]
        href = re.search(r'href="(/bd/[^"]+)"', a)
        out.append(rec("dargaud", img.group(1), series, tome, album, t.group(1) if t else "", cover, authors,
                       "https://www.dargaud.com" + href.group(1) if href else "https://www.dargaud.com/bd-a-paraitre", "Dargaud"))
    return out


def collect_dargaud(src, lo, hi):
    out = []
    for y, m in months(lo, hi):
        page = src.get(f"https://www.dargaud.com/bd-a-paraitre/{m:02d}-{y}", f"dargaud-{y}-{m:02d}")
        got = parse_dargaud(page) if page else []
        out += got
        if not got and (y, m) > (date.today().year, date.today().month): break
    return out


def parse_delcourt(page, base, publisher):
    out = []
    for c in re.split(r'<div class="col-md-6 col-lg-4 mt-3">', page)[1:]:
        a = re.search(r'<h3[^>]*>\s*<a href="([^"]+)"[^>]*><span>([^<]*)', c)
        e = re.search(r'/product/(97[89]\d{10})\.jpe?g', c)
        dm = re.search(r'album-thumbnail__date">\s*(\d\d)\.(\d\d)\.(\d{4})', c)
        if not a or not dm: continue
        path, t = a.group(1).strip(), clean(a.group(2))
        sub = re.search(r'field-name-field-subtitle[^>]*>([^<]*)', c)
        sub = clean(sub.group(1)) if sub else ""
        img = re.search(r'<img[^>]+src="([^"]+)"', c)
        alt = re.search(r'<img[^>]+alt="([^"]*)"', c)
        alt = clean(alt.group(1)) if alt else ""
        pre = alt.rsplit(" - Editions", 1)[0] if " - Editions" in alt else ""
        au = pre.rsplit(" de ", 1)[1].strip() if " de " in pre and not pre.endswith(" de") else ""
        authors = [person(au)] if au and len(au) < 40 and "{{" not in au else []
        mt = re.match(r"^(.*?)\s+T(\d+)(?:\s*-\s*(.*))?$", t)
        series, tome, album = (mt.group(1), mt.group(2), mt.group(3) or "") if mt else (t, "", "")
        mi = re.match(r"^(.*?)\s*-\s*Intégrale\b(.*)$", t)  # « Lanfeust de Troy - Intégrale T05 à T08 »
        if mi: series, tome, album = mi.group(1) + " Intégrale", "", mi.group(2).strip(" -")
        if sub: album = (album + " - " + sub) if album else sub
        title = f"{t} - {sub}" if sub and norm(sub) not in norm(t) else t
        rayon = path.split("/")[1] if path.startswith("/") else ""
        out.append(rec(publisher.lower(), e.group(1) if e else "", series, tome, album,
                       f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}", base + img.group(1) if img and img.group(1).startswith("/") and e else "",
                       authors, base + path if path.startswith("/") else base, publisher, title=title,
                       slug=path.rstrip("/").rsplit("/", 1)[-1]))
        out[-1]["rayon"] = rayon
    return out


def collect_delcourt(src, base, publisher, lists):
    out = []
    for path in lists:
        rayon, kind = path.split("/")[1], path.split("/")[2].split("-")[0]
        for n in range(0, 6):
            page = src.get(base + path + (f"?page={n}" if n else ""), f"{publisher.lower()}-{rayon}-{'ap' if kind == 'a' else 'nv'}-{n}")
            got = parse_delcourt(page, base, publisher) if page else []
            out += got
            tot = re.search(r"(\d+) résultats", page)
            if not got or not tot or (n + 1) * 18 >= int(tot.group(1)): break
    return out


DELCOURT_LISTS = ["/bd/a-paraitre-bandes-dessinees", "/comics/a-paraitre-comics", "/jeunesse/a-paraitre-jeunesse",
                  "/mangas/a-paraitre-mangas", "/kbooks/a-paraitre-kbooks", "/bd/nouveautes-bandes-dessinees", "/comics/nouveautes-comics"]
SOLEIL_LISTS = ["/bd/a-paraitre-bandes-dessinees", "/comics/a-paraitre-comics", "/jeunesse/a-paraitre-jeunesse",
                "/mangas/a-paraitre-mangas", "/bd/nouveautes-bandes-dessinees"]


def parse_lombard(page):
    out, months_seen = [], []
    for sec in re.split(r'<h2 class="section__subtitle', page)[1:]:
        mo = re.match(r'[^>]*>([^<]*)', sec)
        months_seen.append(clean(mo.group(1)) if mo else "")
        for a in re.findall(r'<article class="listbooks__el.*?</article>', sec, re.S):
            ft = clean(re.search(r'<figure[^>]*title="([^"]*)"', a, re.S).group(1)) if re.search(r'<figure[^>]*title="', a) else ""
            img = re.search(r'src="(https://bdi\.dlpdomain\.com/album/(97[89]\d{10})/[^"]+)"', a)
            t = re.search(r'datetime="(\d{4}-\d\d-\d\d)"', a)
            href = re.search(r'href="([^"]+)"', a)
            series = clean(re.search(r'card__title[^>]*>([^<]*)', a).group(1)) if re.search(r'card__title[^>]*>', a) else ""
            mt = re.match(r"^(.*?), Tome (\d+) : (.*)$", ft)
            tome, album = (mt.group(2), mt.group(3)) if mt else ("", ft)
            if tome == "0": tome = ""
            if not series and mt: series = mt.group(1)
            out.append(rec("lombard", img.group(2) if img else "", series or album, tome, album, t.group(1) if t else "",
                           img.group(1) if img else "", [], href.group(1) if href else "https://www.lelombard.com/bd/nouveautes",
                           "Le Lombard", slug=(href.group(1).rstrip("/").rsplit("/", 1)[-1] if href else "")))
    return out


def collect_lombard(src, lo, hi):
    out = []
    for n in range(1, 8):
        page = src.get("https://www.lelombard.com/bd/nouveautes" + (f"/p{n}" if n > 1 else ""), f"lombard-p{n}")
        got = parse_lombard(page) if page else []
        out += got
        ds = [r["date"] for r in got if r["date"]]
        if not got or min(ds, default="") < lo or f'/nouveautes/p{n + 1}"' not in page: break
    return out


def parse_kana(page, y, m):
    out = []
    for blk in re.split(r'<div class="block-date section">', page)[1:]:
        dm = re.search(r'<span class="day">(\d+)</span><span class="month">([^<]*)</span>', blk)
        if not dm or dm.group(2).lower() not in MONTHS: continue
        mm = MONTHS[dm.group(2).lower()]
        yy = y + (1 if mm < m - 6 else -1 if mm > m + 6 else 0)
        d = f"{yy}-{mm:02d}-{int(dm.group(1)):02d}"
        for li in re.findall(r'<div class="loop loop--product".*?</h3>', blk, re.S):
            href = re.search(r'href="([^"]+)"', li)
            img = re.search(r'<img[^>]+src="([^"]+)"', li)
            name = re.search(r'<span class="loop__name__inner"><span>(.*?)</span></span>', li, re.S)
            if not href or not name: continue
            parts = re.split(r"<br\s*/?>", name.group(1))
            series = clean(parts[0])
            sm = clean(parts[1]) if len(parts) > 1 else ""
            tm = re.match(r"^Tome (\d+)$", sm)
            e = EAN_RE.search(img.group(1)) if img and "dlpdomain" in img.group(1) else None
            out.append(rec("kana", e.group(1) if e else "", series, tm.group(1) if tm else "", "" if tm else sm, d,
                           img.group(1) if e else "", [], href.group(1), "Kana",
                           slug=href.group(1).rstrip("/").rsplit("/", 1)[-1]))
    return out


def collect_kana(src, lo, hi):
    out = []
    for y, m in months(lo, hi):
        page = src.get(f"https://www.kana.fr/planning/?month_nb={m}&year_nb={y}", f"kana-{y}-{m:02d}")
        got = parse_kana(page, y, m) if page else []
        out += got
        if not got and (y, m) > (date.today().year, date.today().month): break
    return out


def parse_casterman(page):
    out = []
    for c in re.findall(r'<div class="BookLink BookLink--(\w+)">(.*?)</div>\s*</div>', page, re.S):
        kind, c = ("jeunesse" if c[0] == "youth" else "bd"), c[1]
        e = re.search(r'name="gencod" value="(97[89]\d{10})"', c)
        dm = re.search(r'BookLink-date">\s*(\d\d)/(\d\d)/(\d{4})', c)
        if not e: continue
        href = re.search(r'href="([^"]+)"', c).group(1)
        series = clean(re.search(r'data-description="titre_tome">(.*?)</strong>', c, re.S).group(1))
        ts = re.search(r'data-description="tome">(.*?)</span>', c, re.S)
        ts = clean(ts.group(1)) if ts else ""
        tm = re.match(r"^Tome (\d+)(?:\s*-\s*(.*))?$", ts)
        cr = re.search(r'BookLink-credits">(.*?)</p>', c, re.S)
        authors = [a.strip() for a in re.split(r",| et | - ", clean(cr.group(1)))] if cr else []
        img = re.search(r'<img src="(https://[^"]+)"', c)
        if img and "nocover" in img.group(1): img = None
        if "/Jeunesse/" in href: kind = "jeunesse"
        out.append(rec("casterman", e.group(1), series, tm.group(1) if tm else "", (tm.group(2) or "") if tm else ts,
                       f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}" if dm else "", img.group(1) if img else "", authors,
                       "https://www.casterman.com" + href, "Casterman", kind=kind))
    return out


def parse_ruedesevres(page):
    out = []
    for a in re.findall(r"<article>(.*?)</article>", page, re.S):
        img = re.search(r'src="(https://medias\.edl\.li/[^"]*?(97[89]\d{10})[^"]*)"', a)
        h3 = re.search(r"<h3><a href=\"([^\"]+)\">(.*?)</a></h3>\s*<p>(.*?)</p>", a, re.S)
        if not img or not h3: continue
        dm = re.search(r"A paraître le (\d\d)/(\d\d)/(\d{4})", a)
        t, sub = clean(h3.group(2)), clean(h3.group(3))
        full = t + (" - " + sub if sub else "")
        mt = re.match(r"^(.*?)\s*(?:-\s*)?\b(?:Tome|T|Cycle)\s*(\d+)\b\s*[-:–]?\s*(.*)$", full)
        series, tome, album = (mt.group(1), mt.group(2), mt.group(3)) if mt else (t, "", sub)
        if "(" in series and "intégrale" in series.lower(): series = re.sub(r"\s*\([^)]*\)", "", series) + " Intégrale"
        series = re.sub(r"\s*\([^)]*\)$", "", series).strip()
        out.append(rec("ruedesevres", img.group(2), series, tome, album, f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}" if dm else "",
                       img.group(1), [], "https://www.editions-ruedesevres.fr" + h3.group(1), "Rue de Sèvres",
                       title=full))
    return out


def parse_dupuis(page):
    out = []
    for a in re.findall(r'<div class="carousel__item carousel__item--catalogue.*?carousel__item--title', page, re.S):
        img = re.search(r'data-src="(https://bdi\.dlpdomain\.com/album/(97[89]\d{10})-couv-[^"]+)"[^>]*alt="([^"]*)"', a)
        href = re.search(r'<a href="(/[^"]+/bd/[^"]+)"', a)
        if not img: continue
        alt = clean(img.group(3))
        mt = re.match(r"^(.*?) Tome (\d+) - (.*)$", alt)
        series, tome, album = (mt.group(1), mt.group(2), mt.group(3)) if mt else (alt.split(" - ")[0], "", "")
        out.append(rec("dupuis", img.group(2), series, tome, album, "", img.group(1), [],
                       "https://www.dupuis.com" + href.group(1) if href else "https://www.dupuis.com/catalogue/FR/parutions.html", "Dupuis"))
    return out


# ---------------------------------------------------------------- fusion
PUB_OK = {"dargaud": ("dargaud", "charivari", "blake", "lucky"), "delcourt": ("delcourt", "tonkam", "kbooks"),
          "soleil": ("soleil",), "lombard": ("lombard",), "dupuis": ("dupuis", "graton", "champaka", "aire libre"),
          "casterman": ("casterman",), "ruedesevres": ("rue de sevres",), "kana": ("kana",)}


def match(g, by_tome):
    """Fiche éditeur la plus proche d'une fiche bdgest : même tome, série (ou titre) semblable, date à ±21 jours."""
    k, ka, best, bs = skey(g["series"]), skey(g["album"]), None, 0.0
    sim = lambda a, b: 0.0 if not a or not b else max(difflib.SequenceMatcher(None, a, b).ratio(), 0.9 if min(len(a), len(b)) >= 4 and (a in b or b in a) else 0)
    pub = norm(g["publisher"])
    for r in by_tome.get(g["tome"], []) + ([] if g["tome"] else by_tome.get("1", [])):
        if not any(w in pub for w in PUB_OK.get(r["src"], ())): continue
        if r["date"] and abs((date.fromisoformat(r["date"]) - date.fromisoformat(g["date"])).days) > 21: continue
        rk, ra = skey(r["series"]), skey(r["album"])
        if g["tome"]:
            s = sim(k, rk)
        else:  # one-shot : série ou titre, d'un côté comme de l'autre
            s = max(difflib.SequenceMatcher(None, x, y).ratio() if x and y else 0.0
                    for x in (k, ka, skey(g["title"])) for y in (rk, ra, skey(r["title"])))
            if min(len(k), len(rk)) >= 6 and (rk.startswith(k) or k.startswith(rk)): s = max(s, 0.9)
            if not r["date"]: s -= 0.05  # sans date (mois passé) : plus exigeant
        if ("integrale" in k) != ("integrale" in rk + ra): s -= 0.1
        if r["date"] == g["date"]: s += 0.05
        if s > bs: best, bs = r, s
    if not best and g["tome"]:  # fiche éditeur sans numéro de tome (Dargaud) : même série exactement
        for r in by_tome.get("", []):
            if (any(w in pub for w in PUB_OK.get(r["src"], ())) and skey(r["series"]) == k and len(k) >= 4
                    and (not r["date"] or abs((date.fromisoformat(r["date"]) - date.fromisoformat(g["date"])).days) <= 21)):
                return r
    return best if bs >= 0.86 else None


def collect(lo, hi, fetch, deadline):
    stats, recs = {}, []
    today = date.today().isoformat()
    deadline_ed = deadline - 120  # garde du temps pour les fiches bedetheque

    def run(name, fn):
        s = Src(name, fetch, deadline_ed)
        err = 0
        try: got = fn(s)
        except Exception as e:  # une page qui change de forme ne doit pas arrêter les autres sources
            print(f"  {name} : erreur {e}", file=sys.stderr); got, err = [], 1
        stats[name] = s.stats(0)
        stats[name]["erreurs"] += err
        return got

    bd = run("bdgest", lambda s: collect_bdgest(s, lo, hi))  # d'abord : la liste la plus complète
    recs += run("dargaud", lambda s: collect_dargaud(s, lo, hi))
    recs += run("delcourt", lambda s: collect_delcourt(s, "https://www.editions-delcourt.fr", "Delcourt", DELCOURT_LISTS))
    recs += run("soleil", lambda s: collect_delcourt(s, "https://www.editions-soleil.fr", "Soleil", SOLEIL_LISTS))
    recs += run("lombard", lambda s: collect_lombard(s, lo, hi))
    recs += run("kana", lambda s: collect_kana(s, lo, hi))
    recs += run("casterman", lambda s: parse_casterman(s.get("https://www.casterman.com/", "casterman-0")))
    recs += run("ruedesevres", lambda s: parse_ruedesevres(s.get("https://www.editions-ruedesevres.fr/catalogue", "ruedesevres-catalogue")))
    recs += run("dupuis", lambda s: parse_dupuis(s.get("https://www.dupuis.com/catalogue/FR/parutions.html", "dupuis-0")))

    # une fiche éditeur par ISBN (la première datée)
    uniq = {}
    for r in recs:
        k = r["isbn"] or r["src"] + ":" + r["slug"]
        if k not in uniq or (r["date"] and not uniq[k]["date"]): uniq[k] = r
    recs = list(uniq.values())
    by_tome = {}
    for r in recs: by_tome.setdefault(r["tome"], []).append(r)

    books, used, count = {}, set(), {k: 0 for k in stats}
    enrichis, seen_aid = 0, set()
    for g in bd:
        if g["aid"] in seen_aid: continue
        seen_aid.add(g["aid"])
        r = match(g, by_tome)
        if r and id(r) not in used:
            used.add(id(r)); enrichis += 1
            b = book(r["src"], r["isbn"], r["slug"], g["title"], r["authors"] or g["authors"], g["publisher"],
                     r["date"] or g["date"], r["cover"] or g["cover"], r["url"], kind=r["kind"])
        else:
            b = book("bdgest", "", g["aid"], g["title"], g["authors"], g["publisher"], g["date"], g["cover"], g["url"])
            b["_aid"] = g["aid"]
        if lo <= b["date"] <= hi: books.setdefault(b["id"], b)
    for r in recs:
        if id(r) in used or not r["date"] or not (lo <= r["date"] <= hi): continue
        if SKIP_RE.search(r["title"]): continue
        b = book(r["src"], r["isbn"], r["slug"], r["title"], r["authors"], r["publisher"], r["date"], r["cover"], r["url"], kind=r["kind"])
        books.setdefault(b["id"], b)

    # ISBN des fiches bedetheque : cache facultatif (déjà lues), puis quelques fiches des sorties proches sans ISBN
    cache = load_cache()
    s = Src("bedetheque", fetch, deadline)
    soon = (date.fromisoformat(today) - timedelta(days=7)).isoformat()
    retry = (date.fromisoformat(today) - timedelta(days=7)).isoformat()

    def set_isbn(b, isbn):
        books.pop(b["id"], None)
        if "ed:" + isbn in books: return  # déjà présent par un éditeur : on garde celui-là
        b.update(id="ed:" + isbn, isbn=isbn)
        books[b["id"]] = b

    def set_authors(b, names):
        # la fiche donne les noms complets (bdgest n'a souvent que le nom de famille)
        if names: b["authors"] = list(dict.fromkeys(names))[:3]

    for b in [b for b in books.values() if b.get("_aid")]:
        if cache.get("d:" + b["_aid"]) and not b.get("description"): b["description"] = cache["d:" + b["_aid"]]
        if cache.get("a:" + b["_aid"]): set_authors(b, cache["a:" + b["_aid"]].split("|"))
        if EAN_RE.fullmatch(cache.get(b["_aid"], "")): set_isbn(b, cache[b["_aid"]])
    # à lire : sorties proches sans ISBN, ou dont on n'a pas encore les noms complets des auteurs
    # les plus proches d'aujourd'hui d'abord (avant comme après)
    near = lambda b: abs((date.fromisoformat(b["date"]) - date.fromisoformat(today)).days)
    todo = sorted((b for b in books.values() if b.get("_aid")
                   and ((not b["isbn"] and b["date"] >= soon and not cache.get(b["_aid"], "-0000")[1:] > retry) or "a:" + b["_aid"] not in cache or "d:" + b["_aid"] not in cache)),
                  key=near)[:FICHES]
    found = 0
    for b in todo:
        if time.time() > deadline: break
        if not re.match(r"^https://www\.bedetheque\.com/BD-[^/?]+\.html$", b["url"]): continue
        page = s.get(b["url"], "bedetheque-" + b["_aid"])
        if not page: continue
        names = [person(" ".join(reversed(n.split(", ", 1))) if ", " in n else n)
                 for n in re.findall(r'itemprop="(?:author|illustrator)"[^>]*>([^<]{2,60})<', page)]
        cache["a:" + b["_aid"]] = "|".join(dict.fromkeys(html.unescape(n).strip() for n in names))
        set_authors(b, [n for n in cache["a:" + b["_aid"]].split("|") if n])
        dm = re.search(r'itemprop="description">([^<]{20,})', page)  # résumé de la fiche
        cache["d:" + b["_aid"]] = clean(dm.group(1))[:1500] if dm else ""
        m = re.search(r'id="EAN" value="(97[89]\d{10})"', page)
        if not b["isbn"]: cache[b["_aid"]] = m.group(1) if m else "-" + today
        if m and not b["isbn"]: found += 1; set_isbn(b, m.group(1))
    save_cache(cache)
    stats["bedetheque"] = s.stats(0)
    for b in books.values():
        b.pop("_aid", None)
        count[b["source"].split(":", 1)[1]] = count.get(b["source"].split(":", 1)[1], 0) + 1
    for k in stats: stats[k]["livres"] = count.get(k, 0)
    stats["bdgest"]["rapproches"] = enrichis
    stats["bedetheque"]["isbn_trouves"] = found
    return books, stats
