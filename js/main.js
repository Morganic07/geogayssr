import { creerCarte } from './carte.js';
import { creerSilhouette } from './forme.js';
import { creerAffichageDrapeau } from './drapeau.js';
import { indiceEcart } from './geo.js';
import { creerResolveur } from './saisie.js';
import { creerPartie } from './partie.js';
import { messagePourScore } from './messages.js';
import { activerHorsLigne } from './maj.js';
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

const NOMS_PERIMETRE = {
  onu: 'Les 197 de l\'ONU',
  units: 'Tous les territoires',
  subunits: 'Territoires extrêmes',
  'hors-onu': 'Hors ONU seulement',
};

const PERIMETRE_CAPITALE = 'onu';

const MODES = [
  { cle: 'clic', libelle: 'Cliquer le pays' },
  { cle: 'saisie', libelle: 'Écrire son nom' },
  { cle: 'forme', libelle: 'Deviner la forme' },
  { cle: 'capitale', libelle: 'Deviner la capitale' },
  { cle: 'drapeau', libelle: 'Deviner le drapeau' },
];

// Les modes dont la réponse s'écrit, et ceux qui se passent de la carte du monde.
const MODES_ECRITS = ['saisie', 'forme', 'capitale', 'drapeau'];
const MODES_SANS_CARTE = ['forme', 'drapeau'];

// Une réponse fausse mais reconnue vaut un indice et un second essai : le visuel
// seul ne donne aucune prise, contrairement à la carte qui situe déjà le pays.
const MODES_SECOND_ESSAI = ['forme', 'drapeau'];

const fichiersCharges = new Map();
const vuesPerimetre = new Map();
let alias = null;
let imagesDrapeaux = null;

let carte = null;
let silhouette = null;
let drapeau = null;
let vueCourante = null;
let partie = null;
const resolveurs = new Map();
let resolveurCourant = null;
let perimetreCharge = null;
let manche = null;
let enAttente = false;
let secondEssai = false;
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

async function chargerDrapeaux() {
  if (imagesDrapeaux) return imagesDrapeaux;
  const reponse = await fetch('data/drapeaux.json');
  if (!reponse.ok) {
    throw new Error(`Drapeaux introuvables (erreur ${reponse.status}). Recharge la page`);
  }
  const donnees = await reponse.json();
  imagesDrapeaux = donnees.drapeaux || {};
  return imagesDrapeaux;
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

// Ce qu'un mode exige de l'entité en plus d'appartenir à la carte : une forme
// reconnaissable, une capitale connue, un drapeau attribué sans ambiguïté.
const REQUIS_PAR_MODE = {
  forme: (e) => !!e.forme,
  capitale: (e) => !!e.capitale,
  drapeau: (e) => !!e.drapeau,
};

function estJouable(vue, id, mode) {
  if (vue.jouables ? !vue.jouables.has(id) : !vue.parId.has(id)) return false;
  const requis = REQUIS_PAR_MODE[mode];
  if (!requis) return true;
  const entite = vue.parId.get(id);
  return entite ? requis(entite) : false;
}

function formesDesCapitales(entites) {
  return entites
    .filter((e) => e.capitale)
    .flatMap((e) => e.capitale.noms.map((nom) => ({ id: e.id, fr: nom, en: nom })));
}

function basculerSvg(element, visible) {
  if (visible) element.removeAttribute('hidden');
  else element.setAttribute('hidden', '');
}

function entitesJouables(vue, mode) {
  const requis = REQUIS_PAR_MODE[mode];
  return requis ? vue.entites.filter(requis) : vue.entites;
}

function cleEchec(mode, id) {
  return `${mode}|${id}`;
}

function perimetrePourMode(mode) {
  return mode === 'capitale' ? PERIMETRE_CAPITALE : lireOptions().perimetre;
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
  const { perimetre, zone, mode } = lireOptions();
  const donnees = vuesPerimetre.get(perimetre);
  const champ = $('#nombre-pays');
  if (!donnees) return;
  const disponibles = entitesJouables(donnees, mode);
  const total = zone
    ? disponibles.filter((e) => e.continent === zone).length
    : disponibles.length;
  champ.max = String(total);
  champ.title = `Entre 1 et ${total}`;
  if (Number(champ.value) > total) champ.value = String(total);
}

const RAISON_CARTE_VERROUILLEE =
  'Le mode « Deviner la capitale » ne fonctionne que sur la carte des 197 pays de l\'ONU';

function verrouillerCarte() {
  const capitale = lireOptions().mode === 'capitale';
  let bascule = false;
  for (const champ of document.querySelectorAll('input[name="perimetre"]')) {
    const interdit = capitale && champ.value !== 'onu';
    champ.disabled = interdit;
    const etiquette = champ.closest('label');
    if (etiquette) etiquette.title = interdit ? RAISON_CARTE_VERROUILLEE : '';
    if (interdit && champ.checked) {
      champ.checked = false;
      bascule = true;
    }
  }
  if (bascule) $('input[name="perimetre"][value="onu"]').checked = true;
  return bascule;
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
  const presents = [...new Set(entitesJouables(donnees, lireOptions().mode).map((e) => e.continent))];
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

function entitesRateesPourMode(mode) {
  const donnees = vuesPerimetre.get(perimetrePourMode(mode));
  if (!donnees) return [];
  const prefixe = cleEchec(mode, '');
  return entitesLesPlusRatees()
    .filter((cle) => cle.startsWith(prefixe))
    .map((cle) => cle.slice(prefixe.length))
    .filter((id) => estJouable(donnees, id, mode));
}

const REVISION_MAX = 20;

function rafraichirBoutonErreurs() {
  $('#bouton-voir-erreurs').hidden = MODES.every(
    ({ cle }) => entitesRateesPourMode(cle).length === 0,
  );
}

function vignetteDrapeau(entite) {
  const code = entite && entite.drapeau;
  const image = code && imagesDrapeaux ? imagesDrapeaux[code] : null;
  if (!image) return null;
  const vignette = document.createElement('img');
  vignette.className = 'vignette-drapeau';
  vignette.src = `data:image/webp;base64,${image}`;
  vignette.alt = '';
  return vignette;
}

function remplirListeEntites(liste, ids, donnees, echecs, mode) {
  liste.textContent = '';
  for (const id of ids) {
    const entite = donnees ? donnees.parId.get(id) : null;
    const item = document.createElement('li');
    item.textContent = entite ? entite.fr : id;
    if (mode === 'capitale' && entite && entite.capitale) {
      item.textContent += ` — ${entite.capitale.fr}`;
    }
    if (mode === 'drapeau') {
      const vignette = vignetteDrapeau(entite);
      if (vignette) item.prepend(vignette);
    }
    const rates = echecs ? echecs[cleEchec(mode, id)] : 0;
    if (rates > 1) {
      const compteur = document.createElement('span');
      compteur.className = 'compteur';
      compteur.textContent = `×${rates}`;
      item.append(' ', compteur);
    }
    liste.append(item);
  }
}

function sectionErreurs({ cle, libelle }, ids, echecs, ouverte) {
  const section = document.createElement('details');
  section.className = 'section-erreurs';
  section.open = ouverte;

  const titre = document.createElement('summary');
  const nom = document.createElement('span');
  nom.textContent = libelle;
  const compteur = document.createElement('span');
  compteur.className = 'compteur-section';
  compteur.textContent = String(ids.length);
  titre.append(nom, compteur);
  section.append(titre);

  if (ids.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'section-vide';
    vide.textContent = 'Aucune erreur dans ce mode.';
    section.append(vide);
    return section;
  }

  const liste = document.createElement('ul');
  liste.className = 'liste-rates';
  remplirListeEntites(liste, ids, vuesPerimetre.get(perimetrePourMode(cle)), echecs, cle);
  section.append(liste);

  const aReviser = Math.min(ids.length, REVISION_MAX);
  if (ids.length > REVISION_MAX) {
    const note = document.createElement('p');
    note.className = 'section-note';
    note.textContent = `La révision portera sur les ${REVISION_MAX} plus ratés.`;
    section.append(note);
  }

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton-principal bouton-reviser';
  bouton.dataset.mode = cle;
  bouton.textContent = aReviser === 1 ? 'Réviser cette erreur' : `Réviser ces ${aReviser}`;
  section.append(bouton);
  return section;
}

function construireSectionsErreurs() {
  const conteneur = $('#sections-erreurs');
  conteneur.textContent = '';
  const { mode, perimetre } = lireOptions();
  const { echecs } = chargerProgression();
  let total = 0;

  for (const description of MODES) {
    const ids = entitesRateesPourMode(description.cle);
    total += ids.length;
    conteneur.append(sectionErreurs(description, ids, echecs, description.cle === mode));
  }

  const carte = NOMS_PERIMETRE[perimetre] || perimetre;
  const s = total > 1 ? 's' : '';
  let resume = total === 0
    ? `Aucune erreur enregistrée sur la carte « ${carte} ».`
    : `${total} erreur${s} sur la carte « ${carte} », comptée${s} séparément par mode.`;
  if (perimetre !== PERIMETRE_CAPITALE) {
    resume += ` Les capitales, elles, sont toujours celles de la carte « ${NOMS_PERIMETRE[PERIMETRE_CAPITALE]} ».`;
  }
  $('#erreurs-resume').textContent = resume;
}

async function afficherErreurs() {
  try {
    await chargerPerimetre(lireOptions().perimetre);
    await chargerPerimetre(PERIMETRE_CAPITALE);
    if (entitesRateesPourMode('drapeau').length > 0) await chargerDrapeaux();
  } catch (e) {
    signalerErreur(e);
    return;
  }
  construireSectionsErreurs();
  afficherEcran('ecran-erreurs');
}

function signalerErreur(e) {
  const cible = $('#erreur-chargement');
  cible.hidden = false;
  cible.textContent = `${e.message}.`;
}


async function demarrerPartie(options, entitesImposees = null) {
  const donnees = await chargerPerimetre(options.perimetre);
  vueCourante = donnees;

  const estForme = options.mode === 'forme';
  const estCapitale = options.mode === 'capitale';
  const estDrapeau = options.mode === 'drapeau';
  const sansCarte = MODES_SANS_CARTE.includes(options.mode);
  const disponibles = entitesJouables(donnees, options.mode);

  if (silhouette && !estForme) {
    silhouette.detruire();
    silhouette = null;
  }
  if (drapeau && !estDrapeau) {
    drapeau.detruire();
    drapeau = null;
  }

  if (sansCarte) {
    if (carte) carte.detruire();
    carte = null;
    perimetreCharge = null;
    if (estForme && !silhouette) silhouette = creerSilhouette($('#silhouette'));
    if (estDrapeau && !drapeau) {
      drapeau = creerAffichageDrapeau($('#drapeau'), await chargerDrapeaux());
    }
  } else {
    if (perimetreCharge !== options.perimetre) {
      if (carte) carte.detruire();
      carte = creerCarte($('#carte'), donnees.fond, donnees.jouables);
      carte.dessiner();
      carte.surClicEntite(surClicCarte);
      perimetreCharge = options.perimetre;
    } else {
      carte.reinitialiserEtats();
    }
  }
  basculerSvg($('#carte'), !sansCarte);
  basculerSvg($('#silhouette'), estForme);
  basculerSvg($('#drapeau'), estDrapeau);

  const zone = entitesImposees ? null : options.zone;
  if (carte) carte.filtrerContinent(zone);

  const entites = entitesImposees
    ? disponibles.filter((e) => entitesImposees.includes(e.id))
    : disponibles;

  if (entites.length === 0) {
    if (estForme) throw new Error('aucune forme reconnaissable dans cette sélection');
    if (estDrapeau) throw new Error('aucun drapeau attribuable dans cette sélection');
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
    mode: options.mode,
    estRevision: entitesImposees !== null,
    cle: entitesImposees ? `revision|${options.mode}|${options.perimetre}` : cleScore(options),
  };

  const parEcrit = MODES_ECRITS.includes(options.mode);
  const cleResolveur = estCapitale ? `capitales:${donnees.fichier}` : donnees.fichier;
  if (parEcrit && !resolveurs.has(cleResolveur)) {
    resolveurs.set(cleResolveur, estCapitale
      ? creerResolveur(formesDesCapitales(donnees.fond.entites), {})
      : creerResolveur(donnees.fond.entites, alias));
  }
  resolveurCourant = parEcrit ? resolveurs.get(cleResolveur) : null;
  $('#champ-reponse').hidden = !parEcrit;
  $('#bouton-valider').hidden = !parEcrit;

  afficherEcran('ecran-jeu');
  enAttente = false;
  secondEssai = false;
  poserQuestion();
}

function poserQuestion() {
  const question = partie.questionCourante();
  if (!question) return terminerPartie();

  secondEssai = false;

  $('#progression').textContent = `${question.index} / ${question.total}`;
  $('#progression').style.setProperty(
    '--avancement',
    question.total ? question.index / question.total : 0,
  );
  $('#retour').textContent = '';
  $('#retour').className = 'retour';
  if (carte && partie.mode !== 'capitale') carte.effacerCapitale();

  if (partie.mode === 'clic') {
    $('#consigne').textContent = question.fr;
    return;
  }

  if (partie.mode === 'forme') {
    $('#consigne').textContent = 'Quel est ce territoire ?';
    silhouette.dessiner(vueCourante.parId.get(question.id));
  } else if (partie.mode === 'drapeau') {
    $('#consigne').textContent = 'De quel pays est ce drapeau ?';
    drapeau.dessiner(vueCourante.parId.get(question.id));
  } else if (partie.mode === 'capitale') {
    const entite = vueCourante.parId.get(question.id);
    $('#consigne').textContent = `Quelle est la capitale de ${question.fr} ?`;
    carte.definirEtat(question.id, 'interroge');
    carte.zoomerSur(question.id);
    carte.marquerCapitale(entite && entite.capitale ? entite.capitale.point : null);
  } else {
    $('#consigne').textContent = 'Quel est ce pays ?';
    carte.definirEtat(question.id, 'interroge');
    carte.zoomerSur(question.id);
  }
  const champ = $('#champ-reponse');
  champ.value = '';
  champ.focus();
}

function surClicCarte(id) {
  if (partie && partie.mode === 'clic' && !enAttente) traiterReponse(id);
}

function validerSaisie() {
  if (!partie || enAttente) return;
  if (!MODES_ECRITS.includes(partie.mode)) return;
  const texte = $('#champ-reponse').value.trim();
  if (!texte) return;
  if (!resolveurCourant) return;
  const trouve = resolveurCourant.resoudre(texte);
  traiterReponse(trouve ? trouve.id : null);
}

function offrirSecondEssai(question, idPropose) {
  const retour = $('#retour');
  secondEssai = true;

  const attendue = vueCourante.parId.get(question.id);
  const proposee = idPropose ? vueCourante.parId.get(idPropose) : null;
  const ecart = proposee && attendue
    ? indiceEcart(proposee.centre, attendue.centre)
    : null;

  retour.textContent = ecart
    ? `Non — ${proposee.fr} : ${ecart}. Encore un essai`
    : 'Non reconnu. Encore un essai';
  retour.className = 'retour est-indice';

  const champ = $('#champ-reponse');
  champ.value = '';
  champ.focus();
}

function reponseAttendue(question) {
  if (partie.mode !== 'capitale') return question.fr;
  const entite = vueCourante ? vueCourante.parId.get(question.id) : null;
  return entite && entite.capitale ? entite.capitale.fr : question.fr;
}

function traiterReponse(idPropose) {
  const question = partie.questionCourante();
  if (!question) return;

  if (MODES_SECOND_ESSAI.includes(partie.mode) && !secondEssai && idPropose !== question.id) {
    offrirSecondEssai(question, idPropose);
    return;
  }

  enAttente = true;
  const resultat = partie.repondre(idPropose, secondEssai);
  const retour = $('#retour');

  const marquer = (etat) => {
    if (partie.mode === 'forme') silhouette.definirEtat(etat);
    else if (partie.mode === 'drapeau') drapeau.definirEtat(etat);
    else carte.definirEtat(question.id, etat);
  };

  if (resultat.correct) {
    marquer('juste');
    retour.textContent = 'Juste';
    retour.className = 'retour est-juste';
  } else {
    marquer('faux');
    if (partie.mode === 'clic') {
      carte.memoriserVue();
      carte.zoomerSur(question.id);
    }
    retour.textContent = `${idPropose ? 'Non' : 'Non reconnu'} — ${reponseAttendue(question)}`;
    retour.className = 'retour est-faux';
    enregistrerEchec(cleEchec(partie.mode, question.id));
  }

  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    enAttente = false;
    if (partie.politique === 'rattrapage' && !resultat.correct) {
      marquer('neutre');
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
    for (const id of partie.entitesTrouvees()) oublierEchec(cleEchec(manche.mode, id));
  }

  const ratees = partie.entitesRatees();
  remplirListeEntites($('#liste-ratees'), ratees, vueCourante, null, manche.mode);
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
  const revisions = [...document.querySelectorAll('.bouton-reviser')];
  const libelle = jouer.textContent;
  jouer.disabled = true;
  for (const bouton of revisions) bouton.disabled = true;
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
    for (const bouton of revisions) bouton.disabled = false;
    jouer.textContent = libelle;
  }
}

$('#bouton-jouer').addEventListener('click', () => lancer(lireOptions()));

$('#bouton-voir-erreurs').addEventListener('click', afficherErreurs);

$('#bouton-retour-accueil').addEventListener('click', retournerAccueil);
$('#bouton-accueil').addEventListener('click', retournerAccueil);

$('#sections-erreurs').addEventListener('click', (ev) => {
  const bouton = ev.target.closest('.bouton-reviser');
  if (!bouton) return;
  const mode = bouton.dataset.mode;
  const ratees = entitesRateesPourMode(mode).slice(0, REVISION_MAX);
  if (ratees.length === 0) {
    construireSectionsErreurs();
    return;
  }
  lancer({ ...lireOptions(), mode, perimetre: perimetrePourMode(mode) }, ratees);
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
  if (partie && MODES_ECRITS.includes(partie.mode) && !enAttente) $('#champ-reponse').focus();
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
for (const champ of document.querySelectorAll('input[name="mode"]')) {
  champ.addEventListener('change', () => {
    verrouillerCarte();
    rafraichirZones();
  });
}
for (const nom of ['longueur', 'politique']) {
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

verrouillerCarte();
rafraichirChampNombre();
rafraichirZones();
rafraichirBoutonErreurs();
activerHorsLigne();
