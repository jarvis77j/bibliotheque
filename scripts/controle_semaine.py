#!/usr/bin/env python3
"""Contrôle de la liste « 7 derniers jours » (de J-7 à J) dans data/sorties.json.
Affiche, pour les logs du robot, ce qui reste suspect : titres bizarres, genre vide, sans auteur,
sans couverture, doublons probables, objets qui ne sont pas des livres. Ne modifie rien, sort toujours avec 0.

Usage : python3 scripts/controle_semaine.py [data/sorties.json] [--today AAAA-MM-JJ] [--jours 7]"""
import json, os, re, sys, unicodedata
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()

BAD_TITLE_RE = re.compile(r"^couverture\b|\bpack\b|offre d[ée]couverte|par l.(?:auteur|autrice)\b|saga ph[ée]nom|…$|\.\.\.$|^n/?a$|^[^\w«\"“'’(\[]|\bundefined\b|^null$", re.I)
OBJECT_RE = re.compile(r"sticker|calendrier|puzzle|\bjeu\b|karuta|\bbox\b|coffret|\bkit\b|goodies|poster|peluche|\bmug\b|revue|magazine|n° ?\d+\b|annales|\bau bac\b|audio|ebook", re.I)
BAD_AUTHOR_RE = re.compile(r"^(?:<?collectifs?>?|non|anonyme|number 8|\d+|n/?a)$", re.I)

def charge(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["books"]

def suspects(books, lo, hi):
    """{motif: [livre, …]} pour les livres datés de lo à hi (AAAA-MM-JJ)."""
    sem = [b for b in books if lo <= b.get("date", "") <= hi]
    out = defaultdict(list)
    for b in sem:
        t = (b.get("title") or "").strip()
        if len(t) < 2 or len(t) > 110 or BAD_TITLE_RE.search(t) or t == t.upper() and len(t) > 12 or re.search(r"\s-\s*$|\(\s*\)", t):
            out["titre bizarre"].append(b)
        if OBJECT_RE.search(t) or (b.get("format") or "").lower().startswith(("fichier", "jeux", "calendrier", "contenant")):
            out["peut-être pas un livre papier"].append(b)
        if not b.get("kind"): out["genre vide"].append(b)
        auth = b.get("authors") or []
        if not auth: out["sans auteur"].append(b)
        elif any(BAD_AUTHOR_RE.match(a.strip()) for a in auth): out["auteur faux"].append(b)
        if not b.get("cover"): out["sans couverture"].append(b)
        if not b.get("isbn"): out["sans ISBN"].append(b)
        if b.get("date") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", b["date"]): out["date bizarre"].append(b)
    try:  # doublons probables : mêmes série + tome le même jour (le robot en fusionne déjà ; ceux-là lui ont échappé)
        import editeurs
        seen = defaultdict(list)
        for b in sem: seen[(editeurs.title_keys(b)[1], b["date"])].append(b)
        for grp in seen.values():
            if len(grp) > 1: out["doublon probable"].extend(grp)
    except Exception as e:
        print("  (doublons non vérifiés :", e, ")")
    return sem, out

def main(argv):
    path = os.path.join(HERE, "..", "data", "sorties.json")
    today, jours = date.today(), 7
    a = list(argv)
    while a:
        x = a.pop(0)
        if x == "--today": today = date.fromisoformat(a.pop(0))
        elif x == "--jours": jours = int(a.pop(0))
        else: path = x
    lo, hi = (today - timedelta(days=jours)).isoformat(), today.isoformat()
    try:
        books = charge(path)
    except Exception as e:
        print("contrôle de la semaine : lecture impossible :", e); return 0
    sem, out = suspects(books, lo, hi)
    print(f"== Contrôle de la semaine : {len(sem)} livres du {lo} au {hi} ==")
    par_jour = defaultdict(int)
    for b in sem: par_jour[b["date"]] += 1
    print("  par jour :", ", ".join(f"{d[5:]}={n}" for d, n in sorted(par_jour.items())) or "aucun")
    if len(sem) < 20: print("  ATTENTION : très peu de livres cette semaine, la collecte est peut-être incomplète")
    for motif in ("titre bizarre", "peut-être pas un livre papier", "auteur faux", "doublon probable", "genre vide", "sans auteur", "sans couverture", "sans ISBN", "date bizarre"):
        l = out.get(motif, [])
        if not l: continue
        print(f"-- {motif} : {len(l)}")
        for b in sorted({id(x): x for x in l}.values(), key=lambda b: (b["date"], b["title"]))[:15]:
            print(f"   {b['date'][5:]} | {b['title'][:70]} | {', '.join(b.get('authors') or [])[:25]} | {b.get('publisher', '')[:16]} | {b.get('kind') or '-'} | {b.get('id', '')[:18]}")
        if len(l) > 15: print(f"   … et {len(l) - 15} autres")
    if not out: print("  rien de suspect")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
