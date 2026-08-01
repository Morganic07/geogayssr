# GeoGayssr

Un jeu de géographie qui se joue au doigt : on reconnaît les pays du monde sur une carte.

Site statique, sans backend ni framework. Le jeu livré ne charge **aucune bibliothèque** tout le
travail géographique est payé une fois, à la fabrication des données, sur la machine de
développement.

**Les deux orientations.** Le paysage donne la plus grande carte, mais le clavier y mange l'écran
dès qu'il faut écrire : le jeu fonctionne donc aussi en portrait, et suit l'orientation de
l'appareil sans rien imposer. À la bascule, **le cadrage est conservé** — même échelle, même centre
—, de sorte qu'un pays zoomé le reste après rotation. Seule exception, la vue d'ensemble : elle
reste une vue d'ensemble plutôt que de se retrouver amputée de moitié.

## Deux façons de jouer

Mode 1 : Cliquer sur le pays
Mode 2 : Ecrire le nom du pays
Mode 3 : Deviner la forme, silhouette seule, sans carte ni voisinage
Mode 4 : Deviner la capitale, le pays est montré et nommé, un point marque la ville

Un pays raté ne passe jamais au vert : la bonne réponse est bien montrée c'est un jeu pour
apprendre mais dans la couleur de l'erreur.

## Ce qu'on règle avant de jouer

| Réglage | Choix |
|---|---|
| **Mode** | cliquer le pays · écrire son nom · deviner la forme · deviner la capitale |
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

**Deviner la forme.** Le territoire est découpé de la carte et montré seul, centré, à une taille
qui remplit l'écran : le Vatican et la Russie occupent la même place, la taille ne renseigne plus,
seule la silhouette compte. La réponse s'écrit, avec la même tolérance orthographique que le mode
saisie.

Deux limites, assumées. Un contour de moins de 20 points n'est plus une forme mais un polygone
informe : ces entités sont écartées du mode, ce qui laisse **164 formes sur la carte ONU**, 189 sur
les territoires, 209 sur les extrêmes et 50 seulement en hors-ONU faite d'îlots, cette carte s'y
prête mal. Et le cadrage doit choisir quels morceaux montrer : tout prendre étirerait la France sur
dix fois sa largeur à cause des DOM-TOM, ne garder que le plus gros amputerait le Japon de Hokkaidō.
`build/generer.cjs` agrège donc les morceaux proches du principal tant qu'ils ne creusent pas de
vide, et deux pays dont l'Alaska et le Svalbard faussaient la lecture sont traités par exception
nommée.

**Deviner la capitale.** La carte se recadre sur le pays, ses voisins restent visibles, un point
marque la capitale et la consigne nomme le pays « Quelle est la capitale de la Mongolie ? ». Le
nom anglais est accepté au même titre que le français : « Beijing » vaut Pékin. **192 pays sur
197** sont posés Chypre, Nauru, les Îles Cook, Niue et la Palestine n'ont pas de capitale
exploitable dans la source.

Ce mode ne fonctionne que sur la carte des 197 : les territoires n'ont pas de capitale d'État, et
attribuer à un territoire celle qu'il contient donnerait « la capitale de Honshū » ou « de Bioko ».
Le choisir bascule donc la carte sur ONU et grise les trois autres, avec une infobulle qui dit
pourquoi.

Seize pays ont plusieurs capitales, et **aucun critère automatique ne permet de trancher** : le
plus peuplé donnerait Johannesbourg pour l'Afrique du Sud et Lagos pour le Nigeria, quand le
marqueur « alt » de la source classe Dodoma, capitale officielle de la Tanzanie, comme secondaire.
La table `CAPITALES_MULTIPLES` de `build/generer.cjs` fixe donc la capitale montrée et les réponses
également acceptées Pretoria avec Le Cap et Bloemfontein, Sucre avec La Paz, Amsterdam avec
La Haye. C'est le seul endroit à modifier pour changer un arbitrage.

**Les erreurs sont rangées par mode**, sans exception : rater la position de la Bolivie, ne pas
savoir écrire son nom, ne pas reconnaître sa forme et ignorer sa capitale sont quatre choses
différentes, et la révision ne les mélange pas. La liste des erreurs de capitales affiche la
réponse à côté du pays, « Bolivie — Sucre », ce qui en fait un aide-mémoire consultable.

**Un indice au lieu d'un échec sec.** En mode « deviner la forme », une réponse fausse mais
reconnue n'interrompt pas la question : elle affiche la distance et la direction qui séparent le
pays proposé du bon, et laisse un second essai — « Non — Afghanistan : 12 500 km au nord-ouest.
Encore un essai ». La bonne réponse n'est révélée qu'au second échec.

Une réussite au second essai ne compte pas comme trouvée du premier coup : elle est rangée avec les
rattrapages, donc le pourcentage de réussite garde le même sens qu'avant. La distance se mesure
d'un centre à l'autre, ce qui surprend pour deux voisins le Cameroun et le Nigeria, frontaliers,
sont donnés à 672 km. Les centres sont calculés à la fabrication sur le plus gros morceau de chaque
pays, sans quoi celui de la France tomberait en mer au large de l'Espagne, tiré par les DOM-TOM.

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
alors en plein écran, sans barre d'URL, dans l'orientation que l'on veut.

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
ouvre quatre sections repliables, une par mode, chacune avec son compte et sa propre révision ;
celle du mode choisi à l'accueil s'ouvre d'emblée, et un mode sans erreur reste affiché à zéro. La
liste donne le nombre de fois pour les pays ratés plusieurs fois. Un pays deviné du premier coup
pendant une révision sort de la liste de ce mode ; encore raté, il y reste.

Les trois premières sections suivent la carte choisie à l'accueil. Celle des capitales porte
toujours sur la carte de l'ONU, seule où le mode existe, et sa révision s'y place d'elle-même quelle
que soit la carte affichée à côté.

Les erreurs mémorisées avant cette séparation ne disaient pas de quel mode elles venaient : elles
sont abandonnées à la première ouverture de la nouvelle version, une fois pour toutes. Les
meilleurs scores, eux, traversent la migration intacts.

**Meilleurs scores** par configuration, conservés dans le navigateur.

**Paramètres en cours de partie.** L'engrenage de la barre de jeu ouvre un panneau permettant de
changer de thème ou de quitter, sans perdre l'écran de jeu.


## Publier une mise à jour

Le jeu s'installe sur le téléphone et continue de fonctionner sans réseau. La contrepartie :
chaque appareil garde la version qu'il a téléchargée, et il faut lui signaler qu'une nouvelle
existe. Ce signal, c'est `sw.js` : il contient la liste des fichiers du jeu et une empreinte de
leur contenu. Tant que cette empreinte ne change pas, les appareils considèrent qu'ils sont à
jour et ne retéléchargent rien.

**La règle tient en une phrase : après toute modification, lancer `npm run sw`.**

Le déroulé complet, dans l'ordre :

| | Commande | Ce qu'elle fait |
|---|---|---|
| 1 | *(modifier le code, le style, les données ou les textes)* | |
| 2 | `npm run sw` | met à jour la liste des fichiers et l'empreinte dans `sw.js` |
| 3 | `npm run verifier` | refuse de passer si l'étape 2 a été oubliée |
| 4 | `git commit` puis `git push` | **en incluant `sw.js`** dans le commit |

GitHub Pages republie alors le site. Sur chaque téléphone, au lancement suivant du jeu et à
condition d'avoir du réseau, la nouvelle version se télécharge en arrière-plan, puis l'accueil
affiche « Une nouvelle version est prête ». Rien à désinstaller, rien à réinstaller.

Régénérer les données par `npm run donnees` lance déjà `npm run sw` à la fin : dans ce cas,
l'étape 2 est faite.

### Si l'étape 2 est oubliée

Rien de visible ne casse, et c'est bien le danger. En ligne, le jeu continue de fonctionner
normalement, parce que ce qui n'est pas en cache est simplement demandé au réseau. Hors ligne en
revanche, les appareils servent l'ancienne version indéfiniment, et un fichier nouvellement
ajouté est purement absent le mode de jeu qui en dépend ne se lance pas. Aucun message
n'apparaît, ni sur le téléphone ni au moment de pousser : `npm run verifier` est le seul endroit
où l'oubli est signalé.

### Le cas de l'édition depuis le site de GitHub

Modifier un fichier directement dans l'interface web de GitHub ne permet pas de lancer
`npm run sw`. Le changement est bien publié en ligne, mais **les appareils qui ont installé le
jeu n'en verront jamais rien**. Pour une modification faite de cette façon, il faut repasser par
la machine : `git pull`, puis `npm run sw`, puis commiter et pousser le `sw.js` régénéré.


## Arborescence

### Ce qui part sur le téléphone

```
index.html       La structure : les emplacements, aucun style, aucune règle de jeu.
sw.js          Généré. Service worker : met tout en cache, sert hors ligne, bascule
            de cache à chaque nouvelle empreinte. Ne pas éditer VERSION ni RESSOURCES.
manifest.webmanifest Nom, icônes et plein écran à l'installation. N'impose aucune orientation.
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
 forme.js        Dessine une silhouette isolée, cadrée sur elle-même. Ne sait rien du jeu.
 geo.js         Distance et direction entre deux points du globe. Aucune dépendance.
 maj.js         Enregistre le service worker et propose la mise à jour quand elle est prête.
 main.js        Le câblage : écrans, chargement des données, boucle de jeu.
data/          Généré, mais versionné voir plus bas.
 carte-onu.json    197 pays, contours projetés prêts à dessiner, cadrage des silhouettes.
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
 telecharger.cjs    Récupère les jeux Natural Earth v5 (domaine public) dans build/cache/ :
            trois jeux de frontières et les villes, dont les capitales. 19 Mo pour
            ce dernier, mais rien n'en part sur le téléphone hors nom et position.
 generer.cjs      Projette la Terre, simplifie les frontières, corrige les noms français
            fautifs de la source, marque le hors-ONU, produit les data/carte-*.json.
 alias.mjs       Produit data/alias.json, et refuse d'écrire en cas de collision.
 generer-sw.cjs    Réécrit la liste des ressources et l'empreinte de version dans sw.js.
 verifier-partie.mjs  22 contrôles sur le moteur de jeu : score, rattrapage, bornes, filtres.
 verifier-stockage.mjs 20 contrôles sur la progression : entrée et sortie de la liste d'erreurs,
            et reprise d'une progression enregistrée avant la séparation par mode.
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
