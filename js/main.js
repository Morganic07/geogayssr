// Câblage : écrans, chargement des données, et boucle de jeu reliant la carte,
// le résolveur de saisie, le moteur de partie et la progression persistante.

import { creerCarte } from './carte.js';
import { creerResolveur } from './saisie.js';
import { creerPartie } from './partie.js';
import { messagePourScore } from './messages.js';
import {
  chargerProgression, enregistrerScore, enregistrerEchec,
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

function lireOptions() {
  const radio = (nom) => $(`input[name="${nom}"]:checked`)?.value ?? '';
  const longueur = radio('longueur');
  return {
    mode: radio('mode'),
    perimetre: radio('perimetre'),
    politique: radio('politique'),
    zone: $('#choix-zone').value || null,
    longueur: longueur ? Number(longueur) : null,
  };
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
  rafraichirMeilleurScore();
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
function entitesRevisablesIci() {
  const donnees = cachesDonnees.get(lireOptions().perimetre);
  if (!donnees) return [];
  const presents = new Set(donnees.entites.map((e) => e.id));
  return entitesLesPlusRatees(50).filter((id) => presents.has(id)).slice(0, 20);
}

function rafraichirBoutonRevision() {
  $('#bouton-reviser').hidden = entitesRevisablesIci().length === 0;
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
    // La bonne réponse est toujours montrée : c'est un jeu pour apprendre.
    if (idPropose && idPropose !== question.id) carte.definirEtat(idPropose, 'faux');
    carte.definirEtat(question.id, 'juste');
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

function terminerPartie() {
  const s = partie.score();
  const reussies = s.premierCoup + s.rattrapage;
  const pourcentage = s.total ? Math.round((s.premierCoup / s.total) * 100) : 0;

  enregistrerScore(partie.cle, pourcentage);

  $('#score-final').textContent =
    `${s.premierCoup} sur ${s.total} du premier coup` +
    (s.rattrapage ? `, ${s.rattrapage} au rattrapage` : '') +
    ` — ${pourcentage} %`;
  $('#message-final').textContent = messagePourScore(pourcentage);

  const liste = $('#liste-ratees');
  liste.innerHTML = '';
  const donnees = cachesDonnees.get(perimetreCharge);
  for (const id of partie.entitesRatees()) {
    const entite = donnees.entites.find((e) => e.id === id);
    const item = document.createElement('li');
    item.textContent = entite ? entite.fr : id;
    liste.append(item);
  }

  void reussies;
  afficherEcran('ecran-fin');
  rafraichirBoutonRevision();
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

$('#bouton-reviser').addEventListener('click', () => {
  const ratees = entitesRevisablesIci();
  if (ratees.length === 0) {
    rafraichirBoutonRevision();
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

$('#bouton-quitter').addEventListener('click', () => {
  clearTimeout(minuterie);
  enAttente = false;
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonRevision();
});

$('#bouton-rejouer').addEventListener('click', () => {
  if (dernieresOptions) lancer(dernieresOptions.options, dernieresOptions.entitesImposees);
});

$('#bouton-accueil').addEventListener('click', () => {
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonRevision();
});

// ------------------------------------------------------------------ Thème
// Le thème n'entre pas dans la clé de score : changer d'apparence ne doit pas
// repartir d'un tableau vierge.

function appliquerTheme(nom) {
  const themes = window.THEMES || {};
  const feuille = document.getElementById('feuille-theme');
  if (!themes[nom] || !feuille) return;
  feuille.href = themes[nom];
  try {
    localStorage.setItem('geogayssr.theme', nom);
  } catch (e) {
    // Stockage indisponible : le thème tient pour la session, sans être mémorisé.
  }
}

for (const champ of document.querySelectorAll('input[name="theme"]')) {
  champ.checked = champ.value === (window.THEME_ACTIF || 'sombre');
  champ.addEventListener('change', () => {
    if (champ.checked) appliquerTheme(champ.value);
  });
}

for (const champ of document.querySelectorAll('input[name="perimetre"]')) {
  champ.addEventListener('change', rafraichirZones);
}
for (const nom of ['mode', 'longueur', 'politique']) {
  for (const champ of document.querySelectorAll(`input[name="${nom}"]`)) {
    champ.addEventListener('change', rafraichirMeilleurScore);
  }
}
$('#choix-zone').addEventListener('change', rafraichirMeilleurScore);

rafraichirZones();
rafraichirBoutonRevision();
