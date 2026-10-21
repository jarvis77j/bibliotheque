# Ma Bibliothèque

Web app pour garder la liste des livres lus, sur une étagère virtuelle.

## L'essayer sur l'ordinateur

1. Télécharge le dossier `bibliotheque` (index.html, manifest.json, icon.png, three.min.js, room3d.js).
2. Double-clique sur `index.html` : l'app s'ouvre dans le navigateur.
   Une connexion internet est nécessaire pour la recherche.

## Ce que fait l'app

- **+** : recherche par titre, auteur ou ISBN (Google Livres en français, Open Library en secours).
- **Ajouter** : le livre rejoint l'étagère. La couleur du dos vient de la couverture
  et son épaisseur du nombre de pages.
- **Toucher un dos** : la fiche s'ouvre avec la couverture. Toucher la couverture
  la retourne et montre la 4e de couverture (résumé, éditeur, pages, ISBN).
- **La pièce en 3D** : une bibliothèque sur chaque mur (Lus, En cours, À lire, Coups de cœur). On glisse le doigt à gauche ou à droite pour se tourner vers la suivante, ou on touche les flèches ‹ ›. On pince (ou molette) pour zoomer, puis on glisse pour se déplacer. Toucher un livre ouvre sa fiche. Les onglets du haut tournent aussi la pièce. Si le téléphone ne gère pas la 3D, l'ancienne étagère s'affiche à la place.
- **Onglets** : un livre ajouté depuis un onglet y est rangé.
- **Explorer** : le catalogue par rayons (nouveautés, romance, policier, fantasy…). Touche une couverture pour voir la fiche et l'ajouter en Lu, En cours ou À lire.
- **Ma lecture** (sur la fiche) : statut, note en étoiles, coup de cœur, date de lecture, avis personnel.
- **Chercher dans mes livres** et **trier** (titre, auteur, date de lecture, note) quand l'étagère a au moins 2 livres.
- **Filtres** dans la recherche : titre, auteur, genre (horreur, romance, fantasy, etc.), plus récents d'abord. On peut chercher avec un genre seul.
- **📷 Photographier la 4e de couverture** (sur la fiche d'un livre de la bibliothèque) : la vraie photo du dos remplace le dos dessiné. « Remettre le résumé » revient au texte.
- **Ajouter à la main** un livre introuvable, avec la photo de sa couverture.
- **Filtres de la bibliothèque** : par genre et par auteur. Le genre de chaque livre se change sur sa fiche.
- **📷** dans la recherche : scan du code-barres (seulement quand l'app est en ligne en https).
- **Séries en coffret** : les tomes d'une série (« Harry Potter, tome 2 », « … T3 ») sont reconnus et rangés ensemble dans un coffret à leur nom. La série et le tome se corrigent sur la fiche, qui montre aussi les autres tomes et le prochain à lire.
- **Progression** (livres en cours) : « page 120 sur 350 » avec une barre. Arrivée à la dernière page, le livre passe dans Lus.
- **Prêté à** : le nom de la personne et la date du prêt, puis « Il est rendu ».
- **Mes citations** : les passages préférés de chaque livre, avec la page.
- **Statistiques** (touche la ligne sous le titre, ou ⋯) : objectif de l'année avec sa jauge, livres et pages lus, note moyenne, livres par mois, auteurs et genres préférés, livres en cours et prêtés.
- **Copie automatique** : chaque fois qu'on quitte l'app, une copie est gardée dans le téléphone (une par jour, 14 jours). ⋯ > Copies automatiques permet de revenir à un jour précédent.
- **Rappel de sauvegarde** : tous les 30 jours sans sauvegarde, l'app propose d'en faire une.
- **⋯** : sauvegarder la bibliothèque dans un fichier, ou la restaurer.
- **Ajouter** demande où ranger le livre : Lus, En cours, À lire ou Coups de cœur.
- **Toucher la bibliothèque** (à côté des livres) ou le bouton **▦ Couvertures** : tous les livres de l'étagère en grille de couvertures.
- **Toucher le nom de l'auteur** (fiche ou résultats) ou « 📚 Tous les livres de… » : sa bibliographie.
- **Couvertures** : à fiche égale, l'édition la plus récente est choisie. Rayons **BD** et **Manga** dans Explorer, à partir de séries connues.
- **🗓 Sorties** : les livres qui sortent semaine par semaine (dernière, celle-ci, prochaine), jour par jour, avec couverture, résumé, note, éditeur et distributeur (déduit de l'éditeur, modifiable), liens vers les avis Babelio et Booknode, bouton « À lire ». Filtre par genre.
- **Couleurs** (⋯) : couleur préférée, ambiance de la pièce (chaleureuse, pastel, nature, soirée) et mode clair ou sombre (ou comme le téléphone).
- **Badges** (dans les statistiques) : 16 petits défis (premier livre, 10, 25, 50, 100 livres, pavé de 600 pages, saga, mois record…). Un message s'affiche quand un badge est gagné.
- **Pour toi** (en haut d'Explorer) : la suite de ses séries (les tomes qui manquent), les nouveautés de ses auteurs préférés (deux dernières années) et son genre préféré, sans les livres déjà dans la bibliothèque. Mis à jour une fois par jour.
- **Importer** (⋯) un fichier CSV exporté de Goodreads ou de Babelio : chaque livre est retrouvé (par ISBN, sinon titre et auteur) avec sa couverture, son étagère, sa note et sa date de lecture. Les livres déjà présents sont sautés.
- **Partager ma bibliothèque** (⋯) : un lien qui contient toute la bibliothèque. La personne qui l'ouvre la voit en 3D, en lecture seule, sans rien changer chez elle, avec un bouton « Créer la mienne ».

Les livres sont enregistrés dans le navigateur de l'appareil.

## Plus tard sur l'iPhone (gratuit)

Il faudra héberger le dossier en ligne (par exemple sur GitHub Pages, gratuit).
Ensuite, dans Safari sur l'iPhone, on choisit Partager puis « Sur l'écran d'accueil » :
l'app apparaît avec son icône, comme une vraie app.

## Genre et public au scan

Quand on scanne ou ajoute un livre, l'app propose son genre (littérature générale, romance, dark romance, romantasy, urban fantasy, fantasy, policier…), pour qui il est (adulte, young adult, enfant) et s'il s'agit d'un premier roman. Elle le devine d'après le résumé, l'éditeur et les catégories ; on peut corriger avant de ranger, ou plus tard sur la fiche. Un filtre « Tous les publics » trie l'étagère.

## Sorties, Explorer, Pour toi

Sous le titre, trois boutons : 🗓 Sorties, 🔎 Explorer et ✨ Pour toi (propositions selon les genres, auteurs et séries de la bibliothèque, dont les sorties qui devraient plaire). Les champs de recherche et de tri de l'étagère sont repliés derrière « 🔍 Chercher, trier, filtrer ». Les liens Booknode ont été retirés à la demande de Julie (21 octobre).

## Ambiance Jungle

Dans ⋯ > Ambiance, « Jungle » donne des meubles en bois sombre (blanc pour « À lire »), des murs vert foncé à motif de feuilles, des lianes de pothos qui tombent des étagères et de grandes plantes au sol.

## Âge conseillé

Les livres n'ont pas de PEGI. L'app affiche l'âge indiqué par l'éditeur quand le résumé le dit (« dès 13 ans », « 16+ », « public averti » → 18+). Sinon elle l'estime (dark romance → 18+, young adult → dès 13 ans, new romance → dès 16 ans) et écrit « estimé ». On peut le corriger sur la fiche (ligne « Âge »). Les sorties montrent aussi l'âge quand il est connu.

## Synchro des sorties

Le robot relit leslibraires.fr toutes les heures. L'app recharge sa liste à chaque ouverture de l'onglet Sorties et affiche « Liste mise à jour il y a … ». Le bouton « ↻ Actualiser » force aussi la mise à jour des compléments Google Livres.

## Décorer

⋯ > « 🎨 Décorer ma bibliothèque » ouvre un panneau en bas de l'écran, la bibliothèque restant visible au-dessus. Pour chaque étagère : style du meuble (classique, élégant doré, moderne), bois, couleur et motif du mur, fauteuil, et déco à cocher (plantes, lianes, grandes plantes, bougies, cadres, piles de livres, guirlande, fauteuil, lampe). Le sol se choisit pour toute la pièce. « Mettre ce style partout » copie le réglage sur les 4 étagères ; « Remettre comme avant » revient à l'ambiance.

## Sorties sur 6 mois et 3D plus réaliste (21 octobre)

L'onglet Sorties propose les semaines proches puis les 6 prochains mois (le robot va chercher les précommandes jusqu'à 6 mois). La 3D a de vraies feuilles dessinées (pothos, sansevieria, monstera), du bois veiné, des tranches de livres arrondies avec grain et usure, des pages visibles, des ombres douces et l'ombre au fond de chaque case.

## Économie des recherches Google (21 octobre, soir)
- Google Livres donne 1 000 recherches par jour pour toute l'app (tous les utilisateurs réunis), gratuitement.
- Une recherche déjà faite est gardée 3 jours sur le téléphone (1 jour pour le tri « plus récents ») ; deux demandes identiques en même temps n'en font qu'une ; « Pour toi » est gardé 3 jours (refait plus tôt si les livres changent). Les résultats sont les mêmes.
- Le robot des Sorties n'interroge plus Google (il en consommait environ 770 par jour) ; on peut le relancer à la main avec GOOGLE=1.

## Affichage plus rapide (21 octobre, soir)
- La pièce n'est construite qu'une fois au démarrage (avant, elle était refaite à l'arrivée de chaque photo de bois).
- Changer d'étagère ne reconstruit plus les meubles si les livres n'ont pas changé.
- Les tranches des livres se dessinent plus vite.
- Les couvertures et les photos de matières déjà vues sont gardées sur le téléphone (fichier `sw.js`) : elles s'affichent tout de suite la fois suivante, même sans réseau. Si on change un jour `three.min.js` ou une photo de `textures/`, changer le nom `images-v1` dans `sw.js`.

## Chantier 3D réaliste (21 octobre, soir)
- Fauteuil rembourré aux formes arrondies, coussins, plaid tricoté ; guéridon en bois tourné, lampe en grès avec abat-jour en lin, tasse de thé ; tapis kilim à franges ; suspension en rotin au plafond.
- Lumière plus chaude avec reflets doux, ombres plus douces ; meubles avec corniche moulurée, socle profilé, fond en lames et vernis satiné.
- Tranches de livres plus crédibles (reliures variées, nervures, dorures, usure), pages en feuillets fins.
- Pots tournés (terre cuite, céramique, béton), pothos, sansevieria, pilea ; bougies avec coulures, cadres moulurés sous verre, champignons, lapin, lanterne, mousse, macramé, guirlande, tous refaits.
- Fait par une équipe de trois spécialistes, puis relu et testé par un superviseur (toutes les ambiances, tous les onglets, téléphone et grand écran).

## Matières, déco et lumière (21 octobre)
- Bois des meubles, parquet et murs en briques faits à partir de vraies photos (libres, venant des exemples de three.js), teintées avec la couleur choisie dans « Décorer ».
- Deux nouveaux motifs de mur : Briques et Briques peintes.
- Quelques livres sont posés de face avec leur vraie couverture (un coup de cœur en priorité).
- Lianes plus réalistes (vraie tige, feuilles de tailles variées), avec un réglage Aucune / Un peu / Beaucoup dans « Décorer ».
- Nouvelle déco à activer dans « Décorer » : suspensions en macramé, fleurs séchées encadrées, champignons, petit lapin, lanterne, mousse sur le meuble. L'ambiance Jungle les met d'office.
- Un livre qu'on ajoute glisse dans son rayon, avec un petit bruit ; ouvrir une fiche fait un bruit de page. Les sons se coupent dans ⋯ (Sons).
- La lumière de la pièce suit l'heure : matin doré, journée claire, soirée chaude, nuit tamisée.
- Sorties : dans une semaine ou un mois, une rangée de jours permet de n'afficher qu'un jour.
- Sorties : la rangée des jours reste collée en haut ; toucher un jour fait descendre jusqu'à lui, et le jour affiché s'allume en défilant. En bas, un bouton pour remonter.
- Le robot complète la liste du libraire avec les sorties annoncées sur Google Livres jusqu'à 6 mois (toutes les 4 heures).
- Les lianes partent de vrais pots, passent sur le bord du meuble puis retombent ; grandes plantes avec tiges courbes et vraies feuilles découpées.
- Recherche : les livres récents passent devant (date de première parution), le titre exact reste en tête ; une recherche par auteur va du plus récent au plus ancien. La clé Google est intégrée, rien à saisir.
- Sorties : les deux mois passés sont aussi proposés (le robot garde les sorties depuis le 1er du mois d'il y a deux mois).
