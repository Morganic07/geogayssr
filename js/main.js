// Câblage : écrans, chargement des données, et boucle de jeu reliant la carte,
// le résolveur de saisie, le moteur de partie et la progression persistante.

import { creerCarte } from './carte.js';
import { creerResolveur } from './saisie.js';
import { creerPartie } from './partie.js';
import { messagePourScore } from './messages.js';
import {
  chargerProgression, enregistrerScore, enregistrerEchec, oublierEchec,
  entitesLesPlusRatees,
} from './stockage.js';

const $ = (sel) => document.querySelector(sel);

const CONTINENTS = {
  Europe: 'Europe',
  Africa: 'Afrique',
  Asia: 'Asie',
  'North America': 'Amérique du Nord',
  'South America': 'Amérique du Sud',
  Oceania: 'Océanie',
  Antarctica: 'Antarctique',
};

// Délai d'affichage de la solution avant de passer à la question suivante.
const PAUSE_JUSTE = 550;
const PAUSE_FAUX = 1900;

const cachesDonnees = new Map();
let alias = null;

let carte = null;
let partie = null;
let resolveur = null;
let perimetreCharge = null;
let zoneActive = null;      // zone réellement appliquée à la carte de la partie en cours
let enAttente = false;      // une réponse est en cours d'affichage
let minuterie = 0;

// ------------------------------------------------------------------ Écrans

function afficherEcran(id) {
  for (const ecran of document.querySelectorAll('.ecran')) {
    ecran.classList.toggle('est-actif', ecran.id === id);
  }
}

// ------------------------------------------------------------------ Données

async function chargerPerimetre(nom) {
  if (!cachesDonnees.has(nom)) {
    const reponse = await fetch(`data/carte-${nom}.json`);
    if (!reponse.ok) {
      throw new Error(`Carte introuvable (erreur ${reponse.status}). Recharge la page`);
    }
    cachesDonnees.set(nom, await reponse.json());
  }
  if (!alias) {
    const reponse = await fetch('data/alias.json');
    if (!reponse.ok) {
      throw new Error(`Noms de pays introuvables (erreur ${reponse.status}). Recharge la page`);
    }
    alias = await reponse.json();
  }
  return cachesDonnees.get(nom);
}

// ------------------------------------------------------------------ Accueil

// Nombre de pays demandé, ramené dans les bornes du champ. Une valeur vide ou
// aberrante ne doit pas se propager jusqu'au moteur de partie.
function nombreDemande() {
  const champ = $('#nombre-pays');
  const maxi = Number(champ.max) > 0 ? Number(champ.max) : Infinity;
  const brut = Math.floor(Number(champ.value));
  if (!Number.isFinite(brut) || brut < 1) return 10;
  return Math.min(brut, maxi);
}

function lireOptions() {
  const radio = (nom) => $(`input[name="${nom}"]:checked`)?.value ?? '';
  return {
    mode: radio('mode'),
    perimetre: radio('perimetre'),
    politique: radio('politique'),
    zone: $('#choix-zone').value || null,
    // null vaut « tous les pays » pour creerPartie.
    longueur: radio('longueur') === 'nombre' ? nombreDemande() : null,
  };
}

// Le maximum du champ suit le périmètre et la zone : proposer 300 pays quand
// l'Océanie n'en compte que 24 fabriquerait une attente déçue.
function rafraichirMaxPays() {
  const { perimetre, zone } = lireOptions();
  const donnees = cachesDonnees.get(perimetre);
  const champ = $('#nombre-pays');
  if (!donnees) return;
  const total = zone
    ? donnees.entites.filter((e) => e.continent === zone).length
    : donnees.entites.length;
  champ.max = String(total);
  champ.title = `Entre 1 et ${total}`;
  if (Number(champ.value) > total) champ.value = String(total);
}

function rafraichirChampNombre() {
  $('#nombre-pays').disabled = $('input[name="longueur"]:checked')?.value !== 'nombre';
}

function cleScore(o) {
  return `${o.mode}|${o.perimetre}|${o.zone || 'monde'}|${o.longueur || 'tout'}`;
}

// La liste des zones dépend du périmètre : l'Antarctique n'existe pas dans le
// découpage ONU, et proposer une zone vide produirait une partie impossible.
async function rafraichirZones() {
  const { perimetre } = lireOptions();
  const select = $('#choix-zone');
  const choixActuel = select.value;
  let donnees;
  try {
    donnees = await chargerPerimetre(perimetre);
  } catch (e) {
    signalerErreur(e);
    return;
  }
  const presents = [...new Set(donnees.entites.map((e) => e.continent))];
  select.innerHTML = '<option value="">Monde entier</option>';
  for (const [cle, libelle] of Object.entries(CONTINENTS)) {
    if (!presents.includes(cle)) continue;
    const option = document.createElement('option');
    option.value = cle;
    option.textContent = libelle;
    select.append(option);
  }
  select.value = presents.includes(choixActuel) ? choixActuel : '';
  rafraichirMaxPays();
  rafraichirMeilleurScore();
  // Les erreurs se filtrent au périmètre courant : la liste ne peut être établie
  // qu'une fois ses données chargées, donc pas avant ici.
  rafraichirBoutonErreurs();
}

function rafraichirMeilleurScore() {
  const options = lireOptions();
  const { meilleurs } = chargerProgression();
  const meilleur = meilleurs[cleScore(options)];
  const cible = $('#meilleur-score');
  if (meilleur == null) {
    cible.hidden = true;
  } else {
    cible.hidden = false;
    cible.textContent = `Meilleur score dans cette configuration : ${meilleur} %`;
  }
}

// Les échecs sont mémorisés tous périmètres confondus : rater FXX en « Tous les
// territoires » ne donne rien à réviser en « 197 de l'ONU », où cet identifiant
// n'existe pas. Le bouton ne s'affiche donc que si le périmètre courant contient
// vraiment quelque chose à revoir.
function entitesRateesIci() {
  const donnees = cachesDonnees.get(lireOptions().perimetre);
  if (!donnees) return [];
  const presents = new Set(donnees.entites.map((e) => e.id));
  return entitesLesPlusRatees(1000).filter((id) => presents.has(id));
}

// Une révision ne rejoue pas des dizaines de pays d'affilée : elle prend les plus
// ratés. Le nombre est annoncé sur l'écran des erreurs, jamais tronqué en silence.
const REVISION_MAX = 20;

function entitesRevisablesIci() {
  return entitesRateesIci().slice(0, REVISION_MAX);
}

function rafraichirBoutonErreurs() {
  $('#bouton-voir-erreurs').hidden = entitesRateesIci().length === 0;
}

function afficherErreurs() {
  const ids = entitesRateesIci();
  const donnees = cachesDonnees.get(lireOptions().perimetre);
  const { echecs } = chargerProgression();

  const liste = $('#liste-erreurs');
  liste.textContent = '';
  for (const id of ids) {
    const entite = donnees ? donnees.entites.find((e) => e.id === id) : null;
    const item = document.createElement('li');
    item.textContent = entite ? entite.fr : id;
    // Le nombre de fois où le pays a été raté n'apparaît qu'au-delà d'une fois :
    // « ×1 » sur toute la liste n'apprend rien.
    if (echecs[id] > 1) {
      const compteur = document.createElement('span');
      compteur.className = 'compteur';
      compteur.textContent = `×${echecs[id]}`;
      item.append(' ', compteur);
    }
    liste.append(item);
  }

  const pluriel = ids.length > 1 ? 's' : '';
  $('#erreurs-resume').textContent = ids.length === 0
    ? 'Aucune erreur enregistrée dans ce périmètre.'
    : `${ids.length} pays raté${pluriel} dans ce périmètre` +
      (ids.length > REVISION_MAX ? ` — la révision portera sur les ${REVISION_MAX} plus ratés.` : '.');

  $('#bouton-reviser').hidden = ids.length === 0;
  afficherEcran('ecran-erreurs');
}

function signalerErreur(e) {
  const cible = $('#erreur-chargement');
  cible.hidden = false;
  cible.textContent = `${e.message}.`;
}

// ------------------------------------------------------------------ Partie

async function demarrerPartie(options, entitesImposees = null) {
  const donnees = await chargerPerimetre(options.perimetre);

  // La carte n'est reconstruite que si le périmètre change : redessiner
  // ~360 formes à chaque partie serait perceptible sur mobile.
  if (perimetreCharge !== options.perimetre) {
    if (carte) carte.detruire();
    carte = creerCarte($('#carte'), donnees);
    carte.dessiner();
    carte.surClicEntite(surClicCarte);
    perimetreCharge = options.perimetre;
  } else {
    carte.reinitialiserEtats();
  }
  // Une révision porte sur des pays déjà ratés, où qu'ils soient : lui appliquer
  // le filtre de zone rendrait une partie des questions impossibles à cliquer.
  zoneActive = entitesImposees ? null : options.zone;
  // filtrerContinent recadre déjà la vue, y compris sur le monde entier quand la
  // zone est nulle : y ajouter reinitialiserVue annulerait ce cadrage.
  carte.filtrerContinent(zoneActive);

  resolveur = creerResolveur(donnees.entites, alias);

  const entites = entitesImposees
    ? donnees.entites.filter((e) => entitesImposees.includes(e.id))
    : donnees.entites;

  if (entites.length === 0) {
    throw new Error('aucun pays à réviser dans ce périmètre');
  }

  partie = creerPartie({
    entites,
    mode: options.mode,
    politique: options.politique,
    longueur: entitesImposees ? null : options.longueur,
    zone: zoneActive,
  });
  partie.demarrer();
  // Une révision ne joue ni la longueur ni la zone du formulaire : la ranger sous
  // la clé d'une configuration normale y écraserait un score jamais obtenu.
  partie.cle = entitesImposees ? `revision|${options.mode}|${options.perimetre}` : cleScore(options);
  partie.estRevision = entitesImposees !== null;

  const estSaisie = options.mode === 'saisie';
  $('#champ-reponse').hidden = !estSaisie;
  $('#bouton-valider').hidden = !estSaisie;

  afficherEcran('ecran-jeu');
  enAttente = false;
  poserQuestion();
}

function poserQuestion() {
  const question = partie.questionCourante();
  if (!question) return terminerPartie();

  $('#progression').textContent = `${question.index} / ${question.total}`;
  // Fraction d'avancement offerte à la feuille de style, qui en fait la jauge
  // affichée sous le compteur.
  $('#progression').style.setProperty(
    '--avancement',
    question.total ? question.index / question.total : 0,
  );
  $('#retour').textContent = '';
  $('#retour').className = 'retour';

  if (partie.mode === 'clic') {
    $('#consigne').textContent = question.fr;
  } else {
    // En mode saisie, c'est la carte qui pose la question : on met le pays en
    // évidence et on recadre dessus, sinon un micro-État reste introuvable.
    $('#consigne').textContent = 'Quel est ce pays ?';
    carte.definirEtat(question.id, 'interroge');
    carte.zoomerSur(question.id);
    const champ = $('#champ-reponse');
    champ.value = '';
    champ.focus();
  }
}

function surClicCarte(id) {
  if (partie && partie.mode === 'clic' && !enAttente) traiterReponse(id);
}

function validerSaisie() {
  if (!partie || partie.mode !== 'saisie' || enAttente) return;
  const texte = $('#champ-reponse').value.trim();
  if (!texte) return;
  const trouve = resolveur.resoudre(texte);
  traiterReponse(trouve ? trouve.id : null);
}

function traiterReponse(idPropose) {
  const question = partie.questionCourante();
  if (!question) return;

  enAttente = true;
  const resultat = partie.repondre(idPropose);
  const retour = $('#retour');

  if (resultat.correct) {
    carte.definirEtat(question.id, 'juste');
    retour.textContent = 'Juste';
    retour.className = 'retour est-juste';
  } else {
    // La bonne réponse est montrée — c'est un jeu pour apprendre — mais en rouge :
    // elle marque une erreur, pas un point gagné. Le pays cliqué à tort n'est
    // volontairement pas marqué lui aussi : deux rouges à l'écran, on ne saurait
    // plus lequel est la réponse.
    carte.definirEtat(question.id, 'faux');
    if (partie.mode === 'clic') carte.zoomerSur(question.id);
    retour.textContent = idPropose ? `Non — ${question.fr}` : `Non reconnu — ${question.fr}`;
    retour.className = 'retour est-faux';
    enregistrerEchec(question.id);
  }

  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    enAttente = false;
    // Un pays raté puis remis dans la pile doit repartir en gris, sinon il
    // s'affiche déjà en vert quand on le repose.
    if (partie.politique === 'rattrapage' && !resultat.correct) {
      carte.definirEtat(question.id, 'neutre');
    }
    // Montrer la solution a zoomé sur elle : sans ce recadrage, toutes les
    // questions suivantes seraient posées au zoom du dernier pays révélé.
    if (!resultat.correct && partie.mode === 'clic') {
      carte.filtrerContinent(zoneActive);
    }
    poserQuestion();
  }, resultat.correct ? PAUSE_JUSTE : PAUSE_FAUX);
}

// Un bloc du bilan : le chiffre au-dessus, ce qu'il compte en dessous.
function blocBilan(valeur, etiquette, principal = false) {
  const bloc = document.createElement('span');
  bloc.className = principal ? 'bloc bloc-principal' : 'bloc';
  const nombre = document.createElement('span');
  nombre.className = 'valeur';
  nombre.textContent = valeur;
  const legende = document.createElement('span');
  legende.className = 'etiquette';
  legende.textContent = etiquette;
  bloc.append(nombre, legende);
  return bloc;
}

function terminerPartie() {
  const s = partie.score();
  const pourcentage = s.total ? Math.round((s.premierCoup / s.total) * 100) : 0;

  enregistrerScore(partie.cle, pourcentage);

  // Le pourcentage est le résultat, le détail vient après : en chiffres alignés
  // plutôt qu'en phrase, il se lit d'un coup d'œil sur un écran de téléphone.
  const bilan = $('#score-final');
  bilan.textContent = '';
  bilan.append(
    blocBilan(`${pourcentage} %`, 'de réussite', true),
    blocBilan(`${s.premierCoup} / ${s.total}`, 'du premier coup'),
  );
  if (s.rattrapage) bilan.append(blocBilan(String(s.rattrapage), 'au rattrapage'));
  $('#message-final').textContent = messagePourScore(pourcentage);

  // Une révision réussie fait sortir le pays de la liste des erreurs. Raté à
  // nouveau, l'échec vient d'être réenregistré et il y reste. Hors révision, la
  // liste ne se vide pas toute seule : elle se purge là où on est venu pour ça.
  if (partie.estRevision) {
    for (const id of partie.entitesTrouvees()) oublierEchec(id);
  }

  const ratees = partie.entitesRatees();
  const liste = $('#liste-ratees');
  liste.textContent = '';
  const donnees = cachesDonnees.get(perimetreCharge);
  for (const id of ratees) {
    const entite = donnees.entites.find((e) => e.id === id);
    const item = document.createElement('li');
    item.textContent = entite ? entite.fr : id;
    liste.append(item);
  }
  $('#bloc-erreurs').hidden = ratees.length === 0;

  afficherEcran('ecran-fin');
  rafraichirBoutonErreurs();
}

// ------------------------------------------------------------------ Câblage

let dernieresOptions = null;

// Le premier périmètre chargé pèse près de 600 Ko : sans retour visuel, l'appui
// sur « Jouer » reste sans effet apparent le temps du téléchargement.
let chargementEnCours = false;

async function lancer(options, entitesImposees = null) {
  // Sans ce verrou, un second appui pendant le téléchargement lancerait une
  // deuxième partie par-dessus la première, et le libellé du bouton resterait
  // figé sur « Chargement… ».
  if (chargementEnCours) return;
  chargementEnCours = true;

  dernieresOptions = { options, entitesImposees };
  const jouer = $('#bouton-jouer');
  const reviser = $('#bouton-reviser');
  const libelle = jouer.textContent;
  jouer.disabled = true;
  reviser.disabled = true;
  jouer.textContent = 'Chargement…';
  $('#erreur-chargement').hidden = true;

  try {
    await demarrerPartie(options, entitesImposees);
  } catch (e) {
    afficherEcran('ecran-accueil');
    signalerErreur(e);
  } finally {
    chargementEnCours = false;
    jouer.disabled = false;
    reviser.disabled = false;
    jouer.textContent = libelle;
  }
}

$('#bouton-jouer').addEventListener('click', () => lancer(lireOptions()));

$('#bouton-voir-erreurs').addEventListener('click', afficherErreurs);

$('#bouton-retour-accueil').addEventListener('click', () => {
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonErreurs();
});

$('#bouton-reviser').addEventListener('click', () => {
  const ratees = entitesRevisablesIci();
  // La liste a pu se vider entre l'affichage de l'écran et l'appui : changer de
  // périmètre dans un autre onglet suffit.
  if (ratees.length === 0) {
    afficherErreurs();
    return;
  }
  lancer(lireOptions(), ratees);
});

$('#bouton-valider').addEventListener('click', validerSaisie);

$('#champ-reponse').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    validerSaisie();
  }
});

$('#bouton-reset').addEventListener('click', () => {
  clearTimeout(minuterie);
  if (dernieresOptions) lancer(dernieresOptions.options, dernieresOptions.entitesImposees);
});

$('#bouton-rejouer').addEventListener('click', () => {
  if (dernieresOptions) lancer(dernieresOptions.options, dernieresOptions.entitesImposees);
});

$('#bouton-accueil').addEventListener('click', () => {
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonErreurs();
});

// -------------------------------------------------- Paramètres en cours de jeu

function ouvrirParametres() {
  $('#panneau-parametres').hidden = false;
  $('#bouton-reprendre').focus();
}

function fermerParametres() {
  if ($('#panneau-parametres').hidden) return;
  $('#panneau-parametres').hidden = true;
  // Rendre le clavier au champ, sinon en mode saisie il faut le retoucher du
  // doigt avant de pouvoir répondre.
  if (partie && partie.mode === 'saisie' && !enAttente) $('#champ-reponse').focus();
  else $('#bouton-parametres').focus();
}

$('#bouton-parametres').addEventListener('click', ouvrirParametres);
$('#bouton-reprendre').addEventListener('click', fermerParametres);

// Un clic sur le fond du panneau, en dehors de la boîte, vaut « Reprendre ».
$('#panneau-parametres').addEventListener('click', (ev) => {
  if (ev.target === $('#panneau-parametres')) fermerParametres();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') fermerParametres();
});

$('#bouton-quitter').addEventListener('click', () => {
  clearTimeout(minuterie);
  enAttente = false;
  fermerParametres();
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonErreurs();
});

// ------------------------------------------------------------------ Thème
// Le thème n'entre pas dans la clé de score : changer d'apparence ne doit pas
// repartir d'un tableau vierge.

// Le thème se choisit à deux endroits : dans les options de l'accueil et dans le
// panneau ouvert en cours de partie. Deux groupes de boutons radio distincts —
// un même `name` n'autorise qu'un seul coché dans toute la page, les deux
// listes se décocheraient l'une l'autre — donc une synchronisation explicite.
const CHAMPS_THEME = 'input[name="theme"], input[name="theme-jeu"]';

function synchroniserTheme(nom) {
  for (const champ of document.querySelectorAll(CHAMPS_THEME)) {
    champ.checked = champ.value === nom;
  }
}

function appliquerTheme(nom) {
  const themes = window.THEMES || {};
  const feuille = document.getElementById('feuille-theme');
  if (!themes[nom] || !feuille) return;
  feuille.href = themes[nom];
  synchroniserTheme(nom);
  try {
    localStorage.setItem('geogayssr.theme', nom);
  } catch (e) {
    // Stockage indisponible : le thème tient pour la session, sans être mémorisé.
  }
}

synchroniserTheme(window.THEME_ACTIF || 'sombre');
for (const champ of document.querySelectorAll(CHAMPS_THEME)) {
  champ.addEventListener('change', () => {
    if (champ.checked) appliquerTheme(champ.value);
  });
}

for (const champ of document.querySelectorAll('input[name="perimetre"]')) {
  champ.addEventListener('change', rafraichirZones);
}
for (const nom of ['mode', 'longueur', 'politique']) {
  for (const champ of document.querySelectorAll(`input[name="${nom}"]`)) {
    champ.addEventListener('change', () => {
      rafraichirChampNombre();
      rafraichirMeilleurScore();
    });
  }
}

// Sur « change » et non « input » : borner pendant la frappe rendrait impossible
// de taper 23 en passant par 2, qui serait aussitôt réécrit.
$('#nombre-pays').addEventListener('change', () => {
  $('#nombre-pays').value = String(nombreDemande());
  rafraichirMeilleurScore();
});

$('#choix-zone').addEventListener('change', () => {
  rafraichirMaxPays();
  rafraichirMeilleurScore();
});

rafraichirChampNombre();
rafraichirZones();
rafraichirBoutonErreurs();
