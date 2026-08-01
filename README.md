# GeoGayssr

Un jeu de géographie qui se joue au doigt : on reconnaît les pays du monde sur une carte.

Site statique, sans backend ni framework. Le jeu livré ne charge **aucune bibliothèque** tout le
travail géographique est payé une fois, à la fabrication des données, sur la machine de
développement.

**Orientation paysage obligatoire.** C'est la contrainte qui structure toute la mise en page : une
carte du monde utilisable au pouce, zoomable jusqu'aux micro-États, dans un écran horizontal. En
portrait, le jeu affiche une invitation à tourner le téléphone.

## Deux façons de jouer

Mode 1 : Cliquer sur le pays
Mode 2 : Ecrire le nom du pays 

Un pays raté ne passe jamais au vert : la bonne réponse est bien montrée c'est un jeu pour
apprendre mais dans la couleur de l'erreur.

## Ce qu'on règle avant de jouer

| Réglage | Choix |
|---|---|
| **Mode** | cliquer le pays, ou écrire son nom |
| **Carte** | les 197 de l'ONU · tous les territoires (296) · territoires extrêmes (358) · hors ONU seulement (169) |
| **Zone** | le monde entier, ou un continent |
| **Nombre de pays** | une valeur libre, ou tous |
| **En cas d'erreur** | une seule chance, ou le pays revient plus tard dans la pile |
| **Thème** | sombre ou sorbet |

Le maximum du champ « nombre de pays » suit la carte **et** la zone : il tombe à 16 si on choisit
l'Océanie dans le périmètre ONU.

## Les fonctionnalités

**Tolérance orthographique.** En mode saisie, une faute par tranche de cinq caractères est
pardonnée, et rien en dessous de cinq caractères. Les accents, les traits d'union, les apostrophes
et les articles initiaux sont ignorés. Un dictionnaire de **906 formes pour 395 entités** accepte
les noms anglais, les noms historiques et les surnoms « Birmanie » vaut Myanmar, « Hollande »
vaut Pays-Bas.

**Zoom et déplacement au doigt.** Pincement et glissement pilotés à la main sur le `viewBox` du
SVG, jamais par transformation CSS. Le navigateur ne récupère jamais le geste.

**Les micro-États sont atteignables.** Un pays trop petit pour être touché reçoit une pastille
cliquable, avec une cible de 44 px de diamètre très au-dessus du disque réellement dessiné. En
mode saisie, la carte se recadre sur le pays demandé, à un facteur volontairement modéré : serré
sur ses frontières, un pays n'est qu'une forme hors contexte, c'est le voisinage qui permet de le
reconnaître.

**Hors ONU, pour qui connaît déjà les 197.** La quatrième carte retire de la liste des 358 tout ce
qui est déjà un pays de l'ONU, et ne pose que les 169 restants : Alaska, Açores, Svalbard,
Somaliland, Zanzibar, Écosse, Kaliningrad. Les 197 pays restent **dessinés en fond**, atténués,
mais ne sont ni cliquables ni jamais demandés sans l'Afrique à l'écran, personne ne trouve
Mayotte. En mode saisie, le nom d'un pays de l'ONU est compris mais compté faux : répondre
« Allemagne » affiche la bonne réponse, pas « non reconnu ».

Le partage se fait sur le nom français : une entité des 358 dont le nom est déjà celui d'un des 197
est du fond, jamais une question. C'est ce qui écarte les corps de pays que Natural Earth découpe
sous d'autres codes — l'Australie y est `AUZ`, l'Afrique du Sud `ZAX`. Les deux moitiés de la
Russie, seules à porter un nom dérivé plutôt qu'identique, sont écartées à la main dans
`build/generer.cjs`.

**Jouable hors ligne, et installable.** Un service worker met les 2 Mo du jeu en cache à la
première visite les quatre cartes, les noms, le code, les icônes. Ensuite tout fonctionne sans
réseau, y compris en avion. Le manifeste permet d'ajouter le jeu à l'écran d'accueil : il se lance
alors en plein écran, sans barre d'URL, et **l'orientation paysage est imposée par le système**
l'écran « Tourne ton téléphone » ne s'affiche plus.

**Les mises à jour ne demandent aucune discipline.** Le nom du cache contient une empreinte du
contenu réel de tous les fichiers livrés, calculée par `build/generer-sw.cjs`. Changer une
virgule dans un CSS suffit à produire une nouvelle empreinte, donc un nouveau cache, donc un
re-téléchargement ; et `npm run verifier` **échoue** si `sw.js` n'a pas été régénéré. Il n'y a
pas de numéro de version à penser à incrémenter.

Le nouveau service worker ne prend jamais la main sur une session en cours : il s'installe en
arrière-plan, et l'accueil affiche alors « Une nouvelle version est prête ». Le bouton l'applique
et recharge ; sinon elle s'appliquera d'elle-même au prochain lancement. L'ancien cache est
supprimé à l'activation, il n'en reste jamais deux.

Deux pièges déjoués, tous deux vérifiés par un test : le remplissage du cache force
`cache: 'reload'`, sans quoi le navigateur peut resservir depuis son propre cache HTTP des
fichiers périmés — GitHub Pages envoie un `max-age`. Et l'empreinte couvre aussi la logique de
`sw.js` elle-même, sinon corriger le service worker sans toucher au reste ne déclencherait aucun
rafraîchissement.

**Mémoire des erreurs.** Les pays ratés sont conservés d'une partie à l'autre. « Voir mes erreurs »
les liste, avec le nombre de fois pour ceux ratés plusieurs fois, et de là part une révision qui ne
pose que ceux-là. Un pays deviné du premier coup pendant une révision sort de la liste ; encore
raté, il y reste.

**Meilleurs scores** par configuration, conservés dans le navigateur.

**Paramètres en cours de partie.** L'engrenage de la barre de jeu ouvre un panneau permettant de
changer de thème ou de quitter, sans perdre l'écran de jeu.


## Arborescence

### Ce qui part sur le téléphone

```
index.html       La structure : les emplacements, aucun style, aucune règle de jeu.
sw.js          Généré. Service worker : met tout en cache, sert hors ligne, bascule
            de cache à chaque nouvelle empreinte. Ne pas éditer VERSION ni RESSOURCES.
manifest.webmanifest Nom, icônes, plein écran et orientation paysage à l'installation.
icones/         Le globe de l'application, en 180, 192 et 512 px.
css/
 base.css       Toute la mise en page, plus six constantes. Ne change jamais de thème.
 theme-sombre.css   Uniquement des variables de couleur (32).
 theme-sorbet.css   Idem, autres valeurs.
js/
 carte.js       Rendu SVG, zoom/pan par viewBox, détection des clics. Ne sait rien du jeu.
 partie.js       Séquencement des questions, rattrapage, score. Ne sait rien de la carte.
 saisie.js       Normalisation, distance d'édition, résolution d'un texte vers un pays.
 stockage.js      Meilleurs scores et pays ratés dans localStorage.
 messages.js      Les textes de fin de partie, par palier de score.
 maj.js         Enregistre le service worker et propose la mise à jour quand elle est prête.
 main.js        Le câblage : écrans, chargement des données, boucle de jeu.
data/          Généré, mais versionné voir plus bas.
 carte-onu.json    197 pays, contours projetés prêts à dessiner.
 carte-units.json   296 territoires.
 carte-subunits.json  358 territoires, dont 169 marqués hors ONU.
 alias.json      906 formes acceptées à la saisie, pour 395 entités.
```

Aucun de ces fichiers n'a de dépendance. Le jeu tient en 67 Ko de code et 2 Mo de géométrie. En
navigation ordinaire, une seule carte suffit à jouer les autres ne sont téléchargées que si on
les choisit, et restent alors en mémoire pour la session. Le service worker, lui, prend tout
d'un coup à la première visite, pour que les quatre cartes soient disponibles hors ligne.

### L'atelier jamais exécuté par le navigateur

```
build/
 telecharger.cjs    Récupère les jeux Natural Earth v5 (domaine public) dans build/cache/.
 generer.cjs      Projette la Terre, simplifie les frontières, corrige les noms français
            fautifs de la source, marque le hors-ONU, produit les data/carte-*.json.
 alias.mjs       Produit data/alias.json, et refuse d'écrire en cas de collision.
 generer-sw.cjs    Réécrit la liste des ressources et l'empreinte de version dans sw.js.
 verifier-partie.mjs  22 contrôles sur le moteur de jeu : score, rattrapage, bornes, filtres.
 verifier-stockage.mjs 14 contrôles sur la progression : entrée et sortie de la liste d'erreurs.
 verifier-saisie.mjs  Vérifie que tout nom officiel et tout alias résolvent, sur les quatre
            périmètres, qu'aucune paire piège ne se confond, et qu'aucun des 197
            pays de l'ONU n'est accepté dans le périmètre hors ONU.
 verifier-themes.mjs  Fait respecter le contrat entre base.css et les feuilles de thème.
 verifier-hors-ligne.mjs Refuse un sw.js périmé, un fichier livré absent du cache, ou un
            manifeste incohérent.
```

### À la racine

```
package.json      Les outils de build et les raccourcis npm.
package-lock.json    Leurs versions exactes.
```


## Données

Frontières : [Natural Earth v5](https://github.com/nvkelso/natural-earth-vector), domaine public.
La projection est une Natural Earth I calée sur une largeur de 2000 unités, les coordonnées sont
arrondies au dixième et la simplification est **topologique** traiter chaque frontière séparément
ouvrirait des fentes entre pays voisins.
