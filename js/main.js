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

const PAUSE_JUSTE = 550;
const PAUSE_FAUX = 1900;

const PERIMETRES = {
  onu: { fichier: 'onu' },
  units: { fichier: 'units' },
  subunits: { fichier: 'subunits' },
  'hors-onu': { fichier: 'subunits', jouable: (e) => e.horsOnu === true },
};

const fichiersCharges = new Map();
const vuesPerimetre = new Map();
let alias = null;

let carte = null;
let partie = null;
const resolveurs = new Map();
let resolveurCourant = null;
let perimetreCharge = null;
let manche = null;
let enAttente = false;
let minuterie = 0;


function afficherEcran(id) {
  for (const ecran of document.querySelectorAll('.ecran')) {
    ecran.classList.toggle('est-actif', ecran.id === id);
  }
}

function retournerAccueil() {
  afficherEcran('ecran-accueil');
  rafraichirMeilleurScore();
  rafraichirBoutonErreurs();
}


async function chargerFichier(fichier) {
  if (!fichiersCharges.has(fichier)) {
    const reponse = await fetch(`data/carte-${fichier}.json`);
    if (!reponse.ok) {
      throw new Error(`Carte introuvable (erreur ${reponse.status}). Recharge la page`);
    }
    const donnees = await reponse.json();
    donnees.parId = new Map(donnees.entites.map((e) => [e.id, e]));
    fichiersCharges.set(fichier, donnees);
  }
  return fichiersCharges.get(fichier);
}

async function chargerPerimetre(nom) {
  const definition = PERIMETRES[nom];
  if (!definition) throw new Error(`Carte inconnue « ${nom} ». Recharge la page`);

  if (!alias) {
    const reponse = await fetch('data/alias.json');
    if (!reponse.ok) {
      throw new Error(`Noms de pays introuvables (erreur ${reponse.status}). Recharge la page`);
    }
    alias = await reponse.json();
  }
  if (vuesPerimetre.has(nom)) return vuesPerimetre.get(nom);

  const fond = await chargerFichier(definition.fichier);
  const entites = definition.jouable ? fond.entites.filter(definition.jouable) : fond.entites;
  if (entites.length === 0) {
    throw new Error('Cette carte ne contient aucun pays à deviner. Regénère les données');
  }
  const vue = {
    fichier: definition.fichier,
    fond,
    entites,
    parId: fond.parId,
    jouables: definition.jouable ? new Set(entites.map((e) => e.id)) : null,
  };
  vuesPerimetre.set(nom, vue);
  return vue;
}

function estJouable(vue, id) {
  return vue.jouables ? vue.jouables.has(id) : vue.parId.has(id);
}


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
    longueur: radio('longueur') === 'nombre' ? nombreDemande() : null,
  };
}

function rafraichirMaxPays() {
  const { perimetre, zone } = lireOptions();
  const donnees = vuesPerimetre.get(perimetre);
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

function entitesRateesIci() {
  const donnees = vuesPerimetre.get(lireOptions().perimetre);
  if (!donnees) return [];
  return entitesLesPlusRatees().filter((id) => estJouable(donnees, id));
}

const REVISION_MAX = 20;

function entitesRevisablesIci() {
  return entitesRateesIci().slice(0, REVISION_MAX);
}

function rafraichirBoutonErreurs() {
  $('#bouton-voir-erreurs').hidden = entitesRateesIci().length === 0;
}

function remplirListeEntites(liste, ids, donnees, echecs = null) {
  liste.textContent = '';
  for (const id of ids) {
    const entite = donnees ? donnees.parId.get(id) : null;
    const item = document.createElement('li');
    item.textContent = entite ? entite.fr : id;
    if (echecs && echecs[id] > 1) {
      const compteur = document.createElement('span');
      compteur.className = 'compteur';
      compteur.textContent = `×${echecs[id]}`;
      item.append(' ', compteur);
    }
    liste.append(item);
  }
}

function afficherErreurs() {
  const ids = entitesRateesIci();
  const donnees = vuesPerimetre.get(lireOptions().perimetre);
  const { echecs } = chargerProgression();
  remplirListeEntites($('#liste-erreurs'), ids, donnees, echecs);

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


async function demarrerPartie(options, entitesImposees = null) {
  const donnees = await chargerPerimetre(options.perimetre);

  if (perimetreCharge !== options.perimetre) {
    if (carte) carte.detruire();
    carte = creerCarte($('#carte'), donnees.fond, donnees.jouables);
    carte.dessiner();
    carte.surClicEntite(surClicCarte);
    perimetreCharge = options.perimetre;
  } else {
    carte.reinitialiserEtats();
  }
  const zone = entitesImposees ? null : options.zone;
  carte.filtrerContinent(zone);

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
    zone,
  });
  partie.demarrer();
  manche = {
    zone,
    estRevision: entitesImposees !== null,
    cle: entitesImposees ? `revision|${options.mode}|${options.perimetre}` : cleScore(options),
  };

  const estSaisie = options.mode === 'saisie';
  if (estSaisie && !resolveurs.has(donnees.fichier)) {
    resolveurs.set(donnees.fichier, creerResolveur(donnees.fond.entites, alias));
  }
  resolveurCourant = estSaisie ? resolveurs.get(donnees.fichier) : null;
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
  $('#progression').style.setProperty(
    '--avancement',
    question.total ? question.index / question.total : 0,
  );
  $('#retour').textContent = '';
  $('#retour').className = 'retour';

  if (partie.mode === 'clic') {
    $('#consigne').textContent = question.fr;
  } else {
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
  if (!resolveurCourant) return;
  const trouve = resolveurCourant.resoudre(texte);
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
    carte.definirEtat(question.id, 'faux');
    if (partie.mode === 'clic') {
      carte.memoriserVue();
      carte.zoomerSur(question.id);
    }
    retour.textContent = idPropose ? `Non — ${question.fr}` : `Non reconnu — ${question.fr}`;
    retour.className = 'retour est-faux';
    enregistrerEchec(question.id);
  }

  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    enAttente = false;
    if (partie.politique === 'rattrapage' && !resultat.correct) {
      carte.definirEtat(question.id, 'neutre');
    }
    if (!resultat.correct && partie.mode === 'clic') {
      carte.restaurerVue();
    }
    poserQuestion();
  }, resultat.correct ? PAUSE_JUSTE : PAUSE_FAUX);
}

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

  enregistrerScore(manche.cle, pourcentage);

  const bilan = $('#score-final');
  bilan.textContent = '';
  bilan.append(
    blocBilan(`${pourcentage} %`, 'de réussite', true),
    blocBilan(`${s.premierCoup} / ${s.total}`, 'du premier coup'),
  );
  if (s.rattrapage) bilan.append(blocBilan(String(s.rattrapage), 'au rattrapage'));
  $('#message-final').textContent = messagePourScore(pourcentage);

  if (manche.estRevision) {
    for (const id of partie.entitesTrouvees()) oublierEchec(id);
  }

  const ratees = partie.entitesRatees();
  remplirListeEntites($('#liste-ratees'), ratees, vuesPerimetre.get(perimetreCharge));
  $('#bloc-erreurs').hidden = ratees.length === 0;

  afficherEcran('ecran-fin');
  rafraichirBoutonErreurs();
}


let dernieresOptions = null;

let chargementEnCours = false;

async function lancer(options, entitesImposees = null) {
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

$('#bouton-retour-accueil').addEventListener('click', retournerAccueil);
$('#bouton-accueil').addEventListener('click', retournerAccueil);

$('#bouton-reviser').addEventListener('click', () => {
  const ratees = entitesRevisablesIci();
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

function relancerDerniere() {
  if (dernieresOptions) lancer(dernieresOptions.options, dernieresOptions.entitesImposees);
}

$('#bouton-reset').addEventListener('click', () => {
  clearTimeout(minuterie);
  relancerDerniere();
});

$('#bouton-rejouer').addEventListener('click', relancerDerniere);



function ouvrirParametres() {
  $('#panneau-parametres').hidden = false;
  $('#bouton-reprendre').focus();
}

function fermerParametres() {
  if ($('#panneau-parametres').hidden) return;
  $('#panneau-parametres').hidden = true;
  if (partie && partie.mode === 'saisie' && !enAttente) $('#champ-reponse').focus();
  else $('#bouton-parametres').focus();
}

$('#bouton-parametres').addEventListener('click', ouvrirParametres);
$('#bouton-reprendre').addEventListener('click', fermerParametres);

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
  retournerAccueil();
});


const CHAMPS_THEME = 'input[name="theme"], input[name="theme-jeu"]';

function synchroniserTheme(nom) {
  for (const champ of document.querySelectorAll(CHAMPS_THEME)) {
    champ.checked = champ.value === nom;
  }
}

function appliquerTheme(nom) {
  if (typeof window.appliquerFeuilleTheme !== 'function') return;
  if (!window.appliquerFeuilleTheme(nom)) return;
  synchroniserTheme(nom);
  try {
    localStorage.setItem('geogayssr.theme', nom);
  } catch (e) {
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
