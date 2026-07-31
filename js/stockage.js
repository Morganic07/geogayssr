// Persistance de la progression du joueur dans localStorage.

const CLE = 'geogayssr.progression';
const VERSION = 1;

// État en mémoire : source de vérité pendant la session. localStorage n'est lu
// qu'une fois, puis on n'écrit plus que derrière, de façon groupée.
let progression = null;
let ecritureEnAttente = false;

// `echecs` compte les fois où un pays a été raté ; `oublis` la valeur qu'avait ce
// compteur la dernière fois qu'une révision l'a fait tomber. Un pays est encore
// à réviser tant que echecs > oublis. Deux compteurs qui ne font que croître
// plutôt qu'une suppression : c'est ce qui permet de fusionner deux onglets par
// le maximum sans qu'un pays effacé ici réapparaisse depuis l'autre.
function progressionVide() {
  return { version: VERSION, meilleurs: {}, echecs: {}, oublis: {} };
}

function resteARevoir(courante, id) {
  const rates = courante.echecs[id];
  if (typeof rates !== 'number' || rates <= 0) return 0;
  const oublies = courante.oublis[id];
  const net = rates - (typeof oublies === 'number' ? oublies : 0);
  return net > 0 ? net : 0;
}

// L'accès même à la propriété localStorage peut lever (cookies bloqués, iframe
// cloisonnée), d'où l'enveloppe autour de la simple lecture de l'objet.
function obtenirStockage() {
  try {
    const stockage = globalThis.localStorage;
    return stockage && typeof stockage.getItem === 'function' ? stockage : null;
  } catch {
    return null;
  }
}

function estObjetSimple(valeur) {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

// On ne garde que les entrées dont la valeur est un nombre fini positif : une
// donnée bricolée à la main dans le stockage ne doit pas contaminer les
// comparaisons.
function nettoyerCompteurs(source) {
  const propre = {};
  if (!estObjetSimple(source)) return propre;
  for (const cle of Object.keys(source)) {
    const valeur = source[cle];
    if (typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0) {
      propre[cle] = valeur;
    }
  }
  return propre;
}

// Validation commune à la lecture initiale et aux écritures venues d'un autre
// onglet. Renvoie null si le contenu est inexploitable.
function analyser(brut) {
  let donnees;
  try {
    donnees = JSON.parse(brut);
  } catch {
    return null;
  }
  // Changement de version : on repart de zéro plutôt que de tenter une migration.
  if (!estObjetSimple(donnees) || donnees.version !== VERSION) return null;
  return {
    version: VERSION,
    meilleurs: nettoyerCompteurs(donnees.meilleurs),
    echecs: nettoyerCompteurs(donnees.echecs),
    // Absent des enregistrements antérieurs à la révision : un objet vide y
    // convient, aucun pays n'y avait encore été oublié.
    oublis: nettoyerCompteurs(donnees.oublis),
  };
}

function lireDepuisStockage() {
  const stockage = obtenirStockage();
  if (!stockage) return progressionVide();
  let brut;
  try {
    brut = stockage.getItem(CLE);
  } catch {
    return progressionVide();
  }
  if (!brut) return progressionVide();
  return analyser(brut) || progressionVide();
}

function etat() {
  if (progression === null) progression = lireDepuisStockage();
  return progression;
}

function ecrireMaintenant() {
  // Sert aussi d'annulation : effacerTout remet le drapeau à faux, la microtâche
  // déjà programmée ne doit alors rien réécrire.
  if (!ecritureEnAttente) return;
  ecritureEnAttente = false;
  if (progression === null) return;
  const stockage = obtenirStockage();
  if (!stockage) return;
  try {
    stockage.setItem(CLE, JSON.stringify(progression));
  } catch {
    // Quota dépassé ou stockage en lecture seule : la partie continue en mémoire.
  }
}

// Les écritures d'une même salve (une question, une fin de partie) sont fondues
// en une seule sérialisation à la fin de la tâche courante.
function planifierEcriture() {
  if (ecritureEnAttente) return;
  ecritureEnAttente = true;
  if (typeof queueMicrotask === 'function') queueMicrotask(ecrireMaintenant);
  else setTimeout(ecrireMaintenant, 0);
}

// Les deux compteurs ne font que croître : garder le maximum réconcilie deux
// onglets sans jamais inventer de valeur.
function fusionnerCompteurs(cible, source) {
  for (const cle of Object.keys(source)) {
    const ancien = cible[cle];
    if (typeof ancien !== 'number' || source[cle] > ancien) cible[cle] = source[cle];
  }
}

// Un autre onglet vient d'écrire. Sans cela, la première écriture d'ici, partie
// d'un état en mémoire figé au chargement, écraserait sa progression.
function absorberEcritureExterne(evenement) {
  if (!evenement || evenement.key !== CLE) return;
  // Rien en mémoire : la lecture paresseuse verra d'elle-même la valeur fraîche.
  if (progression === null) return;
  const brut = evenement.newValue;
  if (brut === null) {
    // L'autre onglet a effacé la progression : on suit, le geste est délibéré.
    // Une écriture en attente ici la ferait revenir, on l'annule.
    progression = progressionVide();
    ecritureEnAttente = false;
    return;
  }
  // Un événement sans valeur exploitable n'est pas un effacement : on l'ignore.
  if (typeof brut !== 'string') return;
  const entrante = analyser(brut);
  if (!entrante) return;
  fusionnerCompteurs(progression.meilleurs, entrante.meilleurs);
  fusionnerCompteurs(progression.echecs, entrante.echecs);
  fusionnerCompteurs(progression.oublis, entrante.oublis);
  // Pas de réécriture ici : le stockage porte déjà l'état du dernier écrivain,
  // la fusion sera persistée à la prochaine écriture naturelle.
}

// Filet de sécurité : un onglet fermé ou masqué avant l'exécution de la
// microtâche perdrait la dernière salve.
if (typeof globalThis.addEventListener === 'function') {
  const vider = () => {
    if (ecritureEnAttente) ecrireMaintenant();
  };
  globalThis.addEventListener('pagehide', vider);
  globalThis.addEventListener('visibilitychange', vider);
  globalThis.addEventListener('storage', absorberEcritureExterne);
}

export function chargerProgression() {
  const courante = etat();
  // `echecs` est rendu net des oublis : c'est le nombre que l'interface affiche,
  // et le seul qui ait un sens pour un appelant. La comptabilité interne à deux
  // compteurs ne sort pas d'ici.
  const echecs = {};
  for (const id of Object.keys(courante.echecs)) {
    const net = resteARevoir(courante, id);
    if (net > 0) echecs[id] = net;
  }
  // Copie : l'appelant ne doit pas pouvoir modifier l'état interne sans passer
  // par les fonctions d'écriture.
  return {
    version: courante.version,
    meilleurs: { ...courante.meilleurs },
    echecs,
  };
}

export function enregistrerScore(cle, score) {
  if (typeof cle !== 'string' || cle === '') return;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return;
  const courante = etat();
  const ancien = courante.meilleurs[cle];
  if (typeof ancien === 'number' && score <= ancien) return;
  courante.meilleurs[cle] = score;
  planifierEcriture();
}

export function enregistrerEchec(id) {
  if (typeof id !== 'string' || id === '') return;
  const courante = etat();
  const ancien = courante.echecs[id];
  courante.echecs[id] = (typeof ancien === 'number' ? ancien : 0) + 1;
  planifierEcriture();
}

// Un pays deviné du premier coup pendant une révision sort de la liste : le
// compteur d'oublis rattrape celui des échecs. S'il est encore raté, l'échec
// enregistré fait aussitôt repasser echecs au-dessus, et il y revient.
export function oublierEchec(id) {
  if (typeof id !== 'string' || id === '') return;
  const courante = etat();
  const rates = courante.echecs[id];
  if (typeof rates !== 'number' || rates <= 0) return;
  const oublies = courante.oublis[id];
  if (typeof oublies === 'number' && oublies >= rates) return;
  courante.oublis[id] = rates;
  planifierEcriture();
}

export function entitesLesPlusRatees(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return [];
  const courante = etat();
  const net = {};
  for (const id of Object.keys(courante.echecs)) {
    const reste = resteARevoir(courante, id);
    if (reste > 0) net[id] = reste;
  }
  const ids = Object.keys(net);
  // Départage par identifiant pour que deux appels donnent le même ordre.
  ids.sort((a, b) => net[b] - net[a] || (a < b ? -1 : a > b ? 1 : 0));
  return ids.slice(0, Math.floor(n));
}

export function effacerTout() {
  progression = progressionVide();
  ecritureEnAttente = false;
  const stockage = obtenirStockage();
  if (!stockage) return;
  try {
    stockage.removeItem(CLE);
  } catch {
    // Suppression refusée : on programme une écriture de l'état vide, sinon la
    // progression effacée réapparaîtrait au prochain chargement.
    planifierEcriture();
  }
}
