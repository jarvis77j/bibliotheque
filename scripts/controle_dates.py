#!/usr/bin/env python3
"""Contrôle des dates de sortie dans data/sorties.json (affiché dans les logs du robot).

Pour J-7 .. J+7 : nombre de livres par jour et par source, puis les anomalies repérées :
  - jours de semaine vides, jours dominés par une seule source ;
  - dates au 1er du mois (souvent « mois seulement ») ;
  - dates de week-end ;
  - même ISBN daté de deux façons, même titre daté de deux façons ;
  - livres qui ressemblent à une réédition / nouvelle édition / poche (paru avant, daté de cette semaine) ;
  - désaccords de date relevés par le robot (stats.conflits_dates, stats.ecarts_libraire, stats.dates_relues).

Usage : python3 scripts/controle_dates.py [data/sorties.json] [--today AAAA-MM-JJ]
Bibliothèque standard uniquement. Code de sortie toujours 0 (c'est un contrôle, pas un blocage)."""
import argparse, json, os, re, sys, unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta

JOURS = "lun mar mer jeu ven sam dim".split()
REEDITION = re.compile(r"\b(nouvelle [ée]dition|[ée]dition (augment[ée]e|revue|collector|limit[ée]e|sp[ée]ciale|reli[ée]e|ultimate|2\d{3})|"
                       r"\(?perfect edition|remastered edition|r[ée][ée]dition|r[ée]impression|int[ée]grale|nouvelle couverture)\b", re.I)


def nom_source(b):
    s = b.get("source") or ""
    return s.split(":")[-1] if s else "libraire"


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", "", "".join(c for c in s if not unicodedata.combining(c)))


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("fichier", nargs="?", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sorties.json"))
    ap.add_argument("--today", default=date.today().isoformat())
    a = ap.parse_args(argv)
    path, today = a.fichier, date.fromisoformat(a.today)
    data = json.load(open(path, encoding="utf-8"))
    books, stats = data["books"], data.get("stats", {})
    lo, hi = today - timedelta(days=7), today + timedelta(days=7)
    jours = [lo + timedelta(days=i) for i in range(15)]
    par_jour = defaultdict(Counter)
    for b in books:
        par_jour[b.get("date", "")][nom_source(b)] += 1
    sources = Counter()
    for d in jours:
        sources.update(par_jour[d.isoformat()])
    cols = [s for s, _ in sources.most_common()]

    print(f"== Contrôle des dates (aujourd'hui {today.isoformat()}, {len(books)} livres, mis à jour {data.get('updated', '?')}) ==")
    print("Livres par jour et par source (J-7 .. J+7) :")
    print("  " + "jour".ljust(15) + "total".rjust(6) + "  " + " ".join(c[:9].rjust(9) for c in cols))
    for d in jours:
        c = par_jour[d.isoformat()]
        marque = " <- aujourd'hui" if d == today else ""
        print("  " + f"{d.isoformat()} {JOURS[d.weekday()]}".ljust(15) + str(sum(c.values())).rjust(6) + "  "
              + " ".join((str(c[s]) if c[s] else ".").rjust(9) for s in cols) + marque)
    sem = sum(sum(par_jour[(today - timedelta(days=i)).isoformat()].values()) for i in range(8))
    print(f"  Total J-7..J : {sem} livres")

    anomalies = []
    for d in jours:
        c, n = par_jour[d.isoformat()], sum(par_jour[d.isoformat()].values())
        if d <= today and d.weekday() < 5 and d >= lo and n == 0:
            anomalies.append(f"{d.isoformat()} ({JOURS[d.weekday()]}) : aucun livre un jour de semaine")
        if d.weekday() >= 5 and n:
            anomalies.append(f"{d.isoformat()} ({JOURS[d.weekday()]}) : {n} livre(s) un week-end ({', '.join(f'{s} {k}' for s, k in c.items())})")
        if n >= 40:
            s, k = c.most_common(1)[0]
            if k / n >= 0.6:
                anomalies.append(f"{d.isoformat()} : {k} livres sur {n} viennent de la même source ({s}) - vérifier que ce n'est pas la date de mise en ligne")
    maj = (data.get("updated") or "")[:10]
    if maj:
        c = par_jour[maj]
        for s, k in c.items():
            if k >= 30: anomalies.append(f"{k} livres de la source {s} portent la date du jour de la mise à jour ({maj})")

    # le 1er du mois est un vrai jour de sortie quand il est passé et tombe un jour ouvré ; sinon c'est souvent « mois seulement »
    premiers = [b for b in books if b.get("date", "")[8:] == "01"
                and (b["date"] > today.isoformat() or date.fromisoformat(b["date"]).weekday() >= 5)]
    if premiers:
        r = Counter(nom_source(b) for b in premiers)
        anomalies.append(f"{len(premiers)} livres datés du 1er du mois à venir ou un week-end (peut-être « mois seulement ») : "
                         + ", ".join(f"{s} {k}" for s, k in r.most_common()))

    par_isbn = defaultdict(list)
    par_titre = defaultdict(list)
    for b in books:
        if b.get("isbn"): par_isbn[b["isbn"]].append(b)
        par_titre[(norm(b.get("title")), norm(b.get("publisher")))].append(b)
    for isbn, l in par_isbn.items():
        if len(l) > 1:
            anomalies.append(f"ISBN {isbn} présent {len(l)} fois : " + ", ".join(f"{x['id']} {x['date']}" for x in l))
    for (t, p), l in par_titre.items():
        ds = {x["date"] for x in l}
        if t and len(l) > 1 and len(ds) > 1 and any(lo.isoformat() <= x["date"] <= hi.isoformat() for x in l):
            anomalies.append(f"« {l[0]['title'][:40]} » ({l[0]['publisher'][:20]}) daté de plusieurs façons : " + ", ".join(sorted(ds)))

    sem_l = [b for b in books if lo.isoformat() <= b.get("date", "") <= today.isoformat()]
    reed = [b for b in sem_l if REEDITION.search(b.get("title", "")) or "reedition" in " ".join(map(norm, b.get("rayons", [])))]
    if reed:
        anomalies.append(f"{len(reed)} livre(s) de J-7..J ressemblent à une réédition / édition spéciale : "
                         + " ; ".join(f"{b['title'][:30]} ({b['date'][5:]})" for b in reed[:8]) + (" ..." if len(reed) > 8 else ""))
    poche = sum(1 for b in sem_l if b.get("format", "").lower().startswith("poche"))
    if poche:
        print(f"Info : {poche} des {len(sem_l)} livres de J-7..J sont des poches (reprise d'un livre déjà paru en grand format).")

    ce = stats.get("conflits_dates")
    if isinstance(ce, dict) and ce.get("nombre"):
        anomalies.append(f"{ce['nombre']} désaccord(s) de date entre sources éditeurs (la plus fiable a été gardée), ex. : "
                         + " ; ".join(f"{x['titre']} {x['dates']}" for x in ce.get("exemples", [])[:3]))
    el = stats.get("ecarts_libraire")
    if isinstance(el, dict) and el.get("nombre"):
        anomalies.append(f"{el['nombre']} désaccord(s) entre leslibraires.fr (gardé) et un éditeur, ex. : "
                         + " ; ".join(f"{x['titre']} {x}" for x in el.get("exemples", [])[:2]))
    dr = stats.get("dates_relues")
    if isinstance(dr, dict):
        print(f"Fiches libraire relues ce passage : {dr.get('fiches', 0)} ; dates changées : {len(dr.get('changees', []))}")
        for x in dr.get("changees", [])[:10]:
            print(f"  date changée : {x['titre']} {x['avant']} -> {x['apres']}")

    print("Anomalies :" if anomalies else "Anomalies : aucune")
    for a in anomalies:
        print("  - " + a)


if __name__ == "__main__":
    main(sys.argv[1:])
