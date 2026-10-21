#!/usr/bin/env python3
"""Essai ponctuel : quels sites de librairie publient leurs précommandes loin à l'avance et acceptent les robots ?
Lit seulement le robots.txt et une page de chaque site, puis écrit un résumé dans le journal."""
import re, time, urllib.request
UA = "Mozilla/5.0 (compatible; MaBibliothequeBot/1.0; +https://jarvis77j.github.io/bibliotheque/)"
SITES = {
    "placedeslibraires": ("https://www.placedeslibraires.fr", ["/listeliv.php?base=paraitre", "/"]),
    "lalibrairie": ("https://www.lalibrairie.com", ["/livres/a-paraitre.html", "/"]),
    "chapitre": ("https://www.chapitre.com", ["/"]),
    "gibert": ("https://www.gibert.com", ["/livres/a-paraitre", "/"]),
    "furet": ("https://www.furet.com", ["/"]),
    "cultura": ("https://www.cultura.com", ["/"]),
    "leclerc": ("https://www.culture.leclerc", ["/"]),
    "librairie-dialogues": ("https://www.librairiedialogues.fr", ["/"]),
    "mollat": ("https://www.mollat.com", ["/"]),
    "leslibraires": ("https://www.leslibraires.fr", ["/dossiers/a-paraitre/", "/recherche/?q=&tri=date_desc"]),
}
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR"}), timeout=25) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), ""
for name, (base, paths) in SITES.items():
    st, robots = get(base + "/robots.txt")
    rules = [l.strip() for l in robots.splitlines() if re.match(r"(?i)(user-agent|disallow|allow)\s*:", l.strip())][:25]
    print(f"=== {name} robots {st}"); print("   " + " ; ".join(rules)[:900])
    for p in paths:
        time.sleep(4)
        st, page = get(base + p)
        years = re.findall(r"\b(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)\w*\.? 202[67]\b", page, re.I)
        links = sorted(set(re.findall(r'href="([^"]*(?:paraitre|parution|precommande|pre-commande|nouveaut)[^"]*)"', page, re.I)))[:12]
        print(f"   {p} -> {st}, {len(page)} car., dates vues {len(years)} {years[:5]}, liens {links}")
