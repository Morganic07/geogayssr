const CLE = 'geogayssr.progression';
const VERSION = 1;

let progression = null;
let ecritureEnAttente = false;

function progressionVide() {
  return { version: VERSION, meilleurs: {}, echecs: {}, oublis: {} };
}

function compteursNets(courante) {
  const nets = {};
  for (const id of Object.keys(courante.echecs)) {
    const rates = courante.echecs[id];
    if (typeof rates !== 'number' || rates <= 0) continue;
    const oublies = courante.oublis[id];
    const net = rates - (typeof oublies === 'number' ? oublies : 0);
    if (net > 0) nets[id] = net;
  }
  return nets;
}

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

function analyser(brut) {
  let donnees;
  try {
    donnees = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!estObjetSimple(donnees) || donnees.version !== VERSION) return null;
  return {
    version: VERSION,
    meilleurs: nettoyerCompteurs(donnees.meilleurs),
    echecs: nettoyerCompteurs(donnees.echecs),
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
  if (!ecritureEnAttente) return;
  ecritureEnAttente = false;
  if (progression === null) return;
  const stockage = obtenirStockage();
  if (!stockage) return;
  try {
    stockage.setItem(CLE, JSON.stringify(progression));
  } catch {
  }
}

function planifierEcriture() {
  if (ecritureEnAttente) return;
  ecritureEnAttente = true;
  if (typeof queueMicrotask === 'function') queueMicrotask(ecrireMaintenant);
  else setTimeout(ecrireMaintenant, 0);
}

function fusionnerCompteurs(cible, source) {
  for (const cle of Object.keys(source)) {
    const ancien = cible[cle];
    if (typeof ancien !== 'number' || source[cle] > ancien) cible[cle] = source[cle];
  }
}

function absorberEcritureExterne(evenement) {
  if (!evenement || evenement.key !== CLE) return;
  if (progression === null) return;
  const brut = evenement.newValue;
  if (brut === null) {
    progression = progressionVide();
    ecritureEnAttente = false;
    return;
  }
  if (typeof brut !== 'string') return;
  const entrante = analyser(brut);
  if (!entrante) return;
  fusionnerCompteurs(progression.meilleurs, entrante.meilleurs);
  fusionnerCompteurs(progression.echecs, entrante.echecs);
  fusionnerCompteurs(progression.oublis, entrante.oublis);
}

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
  return {
    version: courante.version,
    meilleurs: { ...courante.meilleurs },
    echecs: compteursNets(courante),
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

export function entitesLesPlusRatees(n = Infinity) {
  if (typeof n !== 'number' || Number.isNaN(n) || n < 1) return [];
  const net = compteursNets(etat());
  const ids = Object.keys(net);
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
    planifierEcriture();
  }
}
