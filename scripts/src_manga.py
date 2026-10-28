#!/usr/bin/env python3
"""Sorties manga (tous les éditeurs français) pour scripts/sorties.py.

Sources (pages publiques, permises par robots.txt au 22/10/2026) :
  nautiljon  https://www.nautiljon.com/planning/manga/?y=AAAA&m=MM&filters=1
             1 page par mois, toutes les sorties du mois : date exacte, série, tome, édition, prix, éditeur,
             EAN (lu dans le lien d'achat, jamais visité : /site/acheter.php est interdit), couverture. Pas d'auteurs.
  manganews  https://www.manga-news.com/index.php/planning?p_year=AAAA&p_month=M&p_editor=&page=N
             20 sorties par page (~15 pages par mois) : date, titre « Série Vol.N », auteurs, éditeur, résumé,
             couverture ; pas d'EAN. Sert à compléter : auteurs/résumé des fiches Nautiljon (même série + tome,
             date à ±10 jours), et ajoute ce que Nautiljon n'a pas (id ed:manganews:<slug>).

Usage : collect(lo, hi, fetch, deadline) -> (livres, stats). Bibliothèque standard uniquement.
"""
import difflib, html, os, re, sys, time
from datetime import date

sys.path.insert(0, os.environ.get("EDITEURS_DIR", os.path.dirname(os.path.abspath(__file__))))
import editeurs  # noqa: E402
from editeurs import norm  # noqa: E402

NJ = "https://www.nautiljon.com"
MN = "https://www.manga-news.com"
MN_MAX_PAGES = 30          # garde-fou par mois
SKIP_RE = re.compile(r"\bcoffret\b|\bpack\b|\bcalendrier\b|\bartbook\b|\bfanbook\b|\bcarnet\b|\bagenda\b|"
                     r"\bgoodies?\b|\bposter\b|\bjeu de cartes\b|\bebook\b|\bnumérique\b|\bmagazine\b|\bhors[- ]série\b|"
                     r"\bcahier d.activités\b|\bbible officielle\b|\brecettes\b|\bcoloriage\b|\bstickers?\b|\bpuzzle\b", re.I)
# mentions d'édition Nautiljon qui ne disent rien de plus que le titre
PLAIN_EDITIONS = {"edition reliee francaise", "edition reliee", "reedition", "nouveaute", "dernier tome", "one shot",
                  "edition simple", "edition standard"}


def months(lo, hi):
    y, m = int(lo[:4]), int(lo[5:7])
    while (y, m) <= (int(hi[:4]), int(hi[5:7])):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _valid(d):
    try: return bool(date.fromisoformat(d))
    except ValueError: return False


def _t(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _tome(v):
    """« Vol. 16 » -> ('16', '') ; « Vol. 3 - Édition Monarque » -> ('3', 'Édition Monarque') ; « One-shot » -> ('', '')."""
    m = re.match(r"(?:Vol\.?|Tome|T)\s*(\d+(?:[.,]\d+)?)\s*(?:-\s*(.*))?$", v.strip(), re.I)
    if m: return m.group(1).lstrip("0") or "0", (m.group(2) or "").strip()
    return "", ("" if norm(v) in ("one shot", "") else v.strip())


def _title(series, tome, extra=""):
    t = f"{series} - Tome {tome}" if tome else series
    return f"{t} ({extra})" if extra else t


def _series_key(s):
    """Clé de rapprochement entre sites : « Amour est dans le thé (l') » == « L'Amour est dans le thé »."""
    s = re.sub(r"\((l'|le|la|les|the)\)\s*$", "", s.strip(), flags=re.I)
    n = norm(s)
    n = re.sub(r"^(l|le|la|les|the|un|une) ", "", n)
    return n.replace(" ", "")


# ---------------------------------------------------------------- Nautiljon
ROW_RE = re.compile(r'<tr id="tr_col_(\d+)" data-planning-date="([^"]*)"[^>]*>(.*?)</tr>', re.S)


def parse_nautiljon(page):
    out = []
    for vid, d, row in ROW_RE.findall(page):
        if not re.match(r"\d{4}-\d{2}-\d{2}$", d) or not _valid(d): continue  # « -- » : date pas encore connue au jour près
        ean = re.search(r"[?&]ean=(\d{13})", row)
        ean = ean.group(1) if ean else ""
        if ean and not ean.startswith(("978", "979")): continue  # EAN 3xxx… : coffrets, goodies
        series = _t((re.search(r'planning_series_title">(.*?)</span>', row, re.S) or [None, ""])[1])
        vol = _t((re.search(r'planning_volume_number">(.*?)</span>', row, re.S) or [None, ""])[1])
        if not series: continue
        tome, extra = _tome(vol) if vol else ("", "")
        eds = [_t(x) for x in re.findall(r'<span class="planning_volume_edition">(.*?)</span>', row, re.S)]
        flags = [_t(x) for x in re.findall(r'<span class="planning_volume_[a-z_]+">(.*?)</span>', row, re.S)
                 if _t(x) and _t(x) not in eds]
        eds = [e for e in eds if e]
        special = [e for e in eds if norm(e) not in PLAIN_EDITIONS and not norm(e).startswith(("reedition", "nouvelle edition"))]
        if not extra and special: extra = special[0]
        title = _title(series, tome, extra)
        if SKIP_RE.search(title): continue
        href = re.search(r'<a href="(/mangas/[^"]+)"', row)
        pub = _t((re.search(r'class="bw p_editeur">(.*?)</td>', row, re.S) or [None, ""])[1])
        if norm(pub) in ("n c", "nc"): pub = ""
        img = re.search(r'data-preview-image="([^"?]+)', row)
        cover = NJ + img.group(1).replace("/mini/", "/") if img else ""  # image pleine taille (vérifiée)
        price = re.search(r"<td>([\d.,]+)&nbsp;€</td>", row)
        out.append({
            "id": f"ed:{ean}" if ean else f"ed:nautiljon:{vid}",
            "title": title, "authors": [], "publisher": pub, "date": d, "isbn": ean, "pages": 0, "format": "Relié" if "reliée" in norm(" ".join(eds)) else "",
            "prix": float(price.group(1).replace(",", ".")) if price else 0,
            "cover": cover, "description": "",
            "rayons": ["Manga"] + [e for e in eds + flags if norm(e) in ("nouveaute", "dernier tome", "one shot", "reedition")][:2],
            "url": NJ + href.group(1) if href else NJ + "/planning/manga/", "kind": "bd", "source": "editeur:nautiljon",
            "_key": (_series_key(series), tome, norm(extra)), "_series": series, "_price": price.group(1) if price else "",
        })
    return out


# ---------------------------------------------------------------- manga-news
ITEM_SPLIT = re.compile(r'<div class="section-list-2-item')


def parse_manganews(page):
    out = []
    lst = page.find('id="listing-chroniques"')
    if lst < 0: return out, False
    body = page[lst:]
    for it in ITEM_SPLIT.split(body)[1:]:
        a = re.search(r'<a class="title" href="([^"]+)"[^>]*>(.*?)</a>', it, re.S)
        if not a: continue
        url = html.unescape(a.group(1))
        raw = _t(re.sub(r'<span class="data-item titlevo">.*?</span>', "", a.group(2), flags=re.S))
        d = editeurs.iso(_t((re.search(r'class="date-out">(.*?)</span>', it, re.S) or [None, ""])[1]))
        if not d or not _valid(d): continue
        m = re.match(r"(.*?)\s+Vol\.?\s*(\d+(?:[.,]\d+)?)\s*(.*)$", raw)
        series, tome, extra = (m.group(1), m.group(2).lstrip("0") or "0", m.group(3).strip(" -")) if m else (raw, "", "")
        # « Amour est dans le thé (l') » -> « L'Amour est dans le thé »
        art = re.search(r"\s*\((l'|le|la|les)\)\s*$", series, re.I)
        if art:
            series = series[:art.start()]
            series = (art.group(1).capitalize() + ("" if art.group(1).endswith("'") else " ") + series).strip()
        title = _title(series, tome, extra)
        if SKIP_RE.search(title): continue
        auth = _t((re.search(r'class="data-item author">(.*?)</span>\s*<span class="data-item editor"', it, re.S)
                   or re.search(r'class="data-item author">(.*?)</span>\s*</', it, re.S) or [None, ""])[1])
        auth = re.sub(r"^Auteur\(s\):\s*", "", auth)
        authors = [x.strip().title() if x.strip().isupper() else x.strip() for x in re.split(r",|/| & ", auth) if x.strip()]
        # « Umebachi YAMANAKA » -> « Umebachi Yamanaka »
        authors = [" ".join(w.capitalize() if w.isupper() and len(w) > 1 else w for w in x.split()) for x in authors]
        pub = re.sub(r"^Editeur:\s*", "", _t((re.search(r'class="data-item editor">(.*?)</span>\s*(?:</|<div|<span)', it, re.S) or [None, ""])[1]))
        img = re.search(r'<img class="entryPicture" src="([^"]+)"', it)
        cover = html.unescape(img.group(1)) if img else ""
        if cover.startswith("/"): cover = MN + cover
        if "nopicture" in cover or "no_cover" in cover: cover = ""
        summ = _t((re.search(r'<div class="summary">(.*?)</div>', it, re.S) or [None, ""])[1])
        slug = norm(url.split("/index.php/manga/", 1)[-1].replace("/", " ")).replace(" ", "-")
        out.append({
            "id": f"ed:manganews:{slug}", "title": title, "authors": authors[:3], "publisher": pub, "date": d,
            "isbn": "", "pages": 0, "format": "", "cover": cover, "description": summ[:1500], "rayons": ["Manga"],
            "url": url, "kind": "" if "light novel" in norm(title) else "bd", "source": "editeur:manganews",
            "_key": (_series_key(series), tome, norm(extra)), "_series": series + " " + extra,
        })
    more = bool(re.search(r'<a class="pager-next"', page))
    return out, more


def _days(a, b):
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


PUB_STOP = {"editions", "edition", "le", "la", "les", "l", "manga", "publishing", "comics", "et"}
def _pubkey(p):
    return next((w for w in norm(p).split() if w not in PUB_STOP), "")


ED_WORDS = re.compile(r"\b(edition|editions|collector|deluxe|perfect|prestige|final|black|star|ultimate|integrale|"
                      r"nouvelle|reedition|double|grand|format|speciale|variant|gold|limitee|reliee|francaise)\b")
def _skey(series):
    """Série sans mentions d'édition, sans article de tête, sans espaces."""
    n = norm(re.sub(r"\((l'|le|la|les|the)\)\s*$", "", series, flags=re.I))
    n = re.sub(r"^(l|le|la|les|the|un|une) ", "", n)
    return ED_WORDS.sub(" ", n).replace(" ", "")


def _same_series(a, b):
    if not a or not b: return False
    if a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a))): return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def merge(nj, mn):
    """Ajoute à nj les sorties manga-news : complète la fiche Nautiljon correspondante (même tome, série voisine,
    même éditeur, date à ±21 jours), sinon crée une fiche. Une fiche Nautiljon ne sert qu'une fois ; un doublon
    ambigu (fiche déjà prise) est écarté plutôt qu'ajouté deux fois."""
    by_tome = {}
    for b in nj.values(): by_tome.setdefault(b["_key"][1], []).append(b)
    used, added, enriched, dropped = set(), 0, 0, 0
    for b in mn:
        sk, coll = _skey(b["_series"]), "collector" in norm(b["title"])
        cands = []
        for c in by_tome.get(b["_key"][1], []) + (by_tome.get("1", []) if not b["_key"][1] else []):
            if _days(c["date"], b["date"]) > 21: continue
            same_pub = _pubkey(c["publisher"]) == _pubkey(b["publisher"])
            ck = _skey(c["_series"])
            if not (_same_series(sk, ck) and (same_pub or sk == ck)): continue
            cands.append(((c["id"] in used, ("collector" in norm(c["title"])) != coll, not same_pub,
                           _days(c["date"], b["date"])), c))
        if cands:
            prio, c = min(cands, key=lambda x: x[0])
            if prio[0]: dropped += 1; continue
            used.add(c["id"])
            if not c["authors"]: c["authors"] = b["authors"]
            if not c["description"]: c["description"] = b["description"]
            enriched += 1
            continue
        if b["id"] in nj: continue
        nj[b["id"]] = b; added += 1
    return added, enriched, dropped


def collect(lo, hi, fetch, deadline, manganews=True):
    books, stats = {}, {}
    # --- Nautiljon : une page par mois
    t0, e0, pages = time.time(), fetch.errors, 0
    cut = False
    for y, m in months(lo, hi):
        if time.time() > deadline: cut = True; break
        page = fetch.get(f"{NJ}/planning/manga/?y={y}&m={m:02d}&filters=1", f"nautiljon-{y}-{m:02d}")
        pages += 1
        for b in parse_nautiljon(page) if page else []:
            if lo <= b["date"] <= hi: books.setdefault(b["id"], b)
    stats["nautiljon"] = {"pages": pages, "livres": len(books), "secondes": round(time.time() - t0), "erreurs": fetch.errors - e0}
    if cut: stats["nautiljon"]["incomplet"] = True
    # --- manga-news : toutes les pages de chaque mois
    if manganews:
        t0, e0, pages, got = time.time(), fetch.errors, 0, []
        today = date.today().strftime("%Y-%m")
        # mois proches d'aujourd'hui d'abord : si le temps manque, ce sont les plus lointains qui sautent
        for y, m in sorted(months(lo, hi), key=lambda ym: abs((ym[0] * 12 + ym[1]) - (int(today[:4]) * 12 + int(today[5:])))):
            for n in range(1, MN_MAX_PAGES + 1):
                if time.time() > deadline: cut = True; break
                url = f"{MN}/index.php/planning?p_year={y}&p_month={m}&p_editor=" + (f"&page={n}" if n > 1 else "")
                page = fetch.get(url, f"manganews-{y}-{m:02d}-{n}")
                pages += 1
                items, more = parse_manganews(page) if page else ([], False)
                got += [b for b in items if lo <= b["date"] <= hi]
                if not items or not more: break
        added, enriched, dropped = merge(books, got)
        stats["manganews"] = {"pages": pages, "livres": added, "completes": enriched, "ecartes": dropped, "lus": len(got),
                              "secondes": round(time.time() - t0), "erreurs": fetch.errors - e0}
        if cut: stats["manganews"]["incomplet"] = True
    for b in books.values():
        for k in [k for k in b if k.startswith("_")]: del b[k]
    return books, stats
