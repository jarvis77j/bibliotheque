#!/usr/bin/env python3
"""Essai ponctuel : structure de la page « à paraître » du Furet du Nord (robots.txt l'autorise)."""
import re, time, urllib.request, html
UA = "Mozilla/5.0 (compatible; MaBibliothequeBot/1.0; +https://jarvis77j.github.io/bibliotheque/)"
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR"}), timeout=25) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), ""
for path in ["/livres/top-a-paraitre.html", "/livres/top-a-paraitre.html?p=2", "/livres/top-a-paraitre.html?p=10"]:
    st, page = get("https://www.furet.com" + path); time.sleep(5)
    prods = list(dict.fromkeys(re.findall(r'href="(https://www\.furet\.com/livres/[^"]+\.html)"', page)))
    dates = re.findall(r"(\d{1,2}/\d{2}/20\d\d|\d{1,2} \w+ 202[67])", page)
    pag = sorted(set(re.findall(r'href="([^"]*[?&]p=\d+[^"]*)"', page)))[:8]
    print(f"=== {path} {st} {len(page)} car. produits {len(prods)} dates {len(dates)} {dates[:12]}")
    print("   pages:", pag)
    print("   produits:", prods[:6])
    i = page.find(prods[0]) if prods else -1
    if i > 0: print("   extrait:", re.sub(r"\s+", " ", page[i - 1500:i + 2500])[:3500])
if prods:
    st, page = get(prods[0])
    print("=== fiche", prods[0], st, len(page))
    for k in ["Date de parution", "parution", "EAN", "ISBN", "Editeur", "Éditeur", "og:image", "itemprop", "ld+json"]:
        j = page.find(k); print("  ", k, "->", re.sub(r"\s+", " ", page[j - 100:j + 300]) if j >= 0 else "absent")
