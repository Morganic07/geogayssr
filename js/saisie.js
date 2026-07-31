const EQUIVALENCES = {
  'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'å': 'a', 'ß': 'ss',
  'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i'
};

const APOSTROPHES = /[\u2018\u2019\u201b\u02bc\u02b9\u00b4`]/g;
const ARTICLE_INITIAL = /^(?:l['\s]\s*|le\s+|la\s+|les\s+|the\s+)/;

const CARACTERES_PAR_FAUTE = 5;
const LONGUEUR_PLANCHER = 5;

export function normaliser(texte) {
  if (typeof texte !== 'string') return '';
  let sortie = texte.toLowerCase();
  sortie = sortie.replace(/[æœøåßđðþłı]/g, (c) => EQUIVALENCES[c]);
  sortie = sortie.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  sortie = sortie.replace(APOSTROPHES, "'");
  sortie = sortie.replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
  sortie = sortie.replace(ARTICLE_INITIAL, '');
  sortie = sortie.replace(/'/g, ' ').replace(/\s+/g, ' ').trim();
  return sortie;
}

export function distance(a, b, seuilMax = Infinity) {
  if (a === b) return 0;
  const longA = a.length;
  const longB = b.length;
  if (longA === 0) return longB;
  if (longB === 0) return longA;
  if (Math.abs(longA - longB) > seuilMax) return seuilMax + 1;

  const court = longA <= longB ? a : b;
  const longue = longA <= longB ? b : a;
  const n = court.length;

  let precedente = new Array(n + 1);
  let courante = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) precedente[j] = j;

  for (let i = 1; i <= longue.length; i += 1) {
    courante[0] = i;
    let minLigne = i;
    const codeLigne = longue.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const cout = court.charCodeAt(j - 1) === codeLigne ? 0 : 1;
      let valeur = precedente[j - 1] + cout;
      const suppression = precedente[j] + 1;
      if (suppression < valeur) valeur = suppression;
      const insertion = courante[j - 1] + 1;
      if (insertion < valeur) valeur = insertion;
      courante[j] = valeur;
      if (valeur < minLigne) minLigne = valeur;
    }
    if (minLigne > seuilMax) return seuilMax + 1;
    const echange = precedente;
    precedente = courante;
    courante = echange;
  }
  return precedente[n];
}

function seuilPour(longueur) {
  if (longueur < LONGUEUR_PLANCHER) return 0;
  return Math.floor(longueur / CARACTERES_PAR_FAUTE);
}

export function creerResolveur(entites, alias = {}) {
  const index = new Map();
  const formes = [];
  const connus = new Set();

  function ajouter(texte, id) {
    const forme = normaliser(texte);
    if (!forme) return;
    const existante = index.get(forme);
    if (existante) {
      if (existante.id !== id) existante.partagee = true;
      return;
    }
    const entree = { forme, id, longueur: forme.length, partagee: false };
    index.set(forme, entree);
    formes.push(entree);
  }

  for (const entite of entites || []) {
    if (!entite || !entite.id) continue;
    connus.add(entite.id);
    ajouter(entite.fr, entite.id);
    ajouter(entite.en, entite.id);
  }
  for (const id of Object.keys(alias || {})) {
    if (!connus.has(id)) continue;
    const liste = alias[id];
    if (!Array.isArray(liste)) continue;
    for (const forme of liste) ajouter(forme, id);
  }

  function resoudre(texteSaisi) {
    const saisie = normaliser(texteSaisi);
    if (!saisie) return null;

    const exacte = index.get(saisie);
    if (exacte) return exacte.partagee ? null : { id: exacte.id, score: 1 };

    const seuil = seuilPour(saisie.length);

    let meilleurId = null;
    let meilleureDistance = Infinity;
    let meilleurScore = 0;
    let ambigu = false;
    let distancePartagee = Infinity;

    if (seuil > 0) {
      for (const entree of formes) {
        if (Math.abs(saisie.length - entree.longueur) > seuil) continue;
        const ecart = distance(saisie, entree.forme, seuil);
        if (ecart > seuil) continue;
        if (entree.partagee) {
          if (ecart < distancePartagee) distancePartagee = ecart;
          continue;
        }
        const score = 1 - ecart / Math.max(saisie.length, entree.longueur);
        if (ecart < meilleureDistance) {
          meilleurId = entree.id;
          meilleureDistance = ecart;
          meilleurScore = score;
          ambigu = false;
        } else if (ecart === meilleureDistance) {
          if (entree.id !== meilleurId) ambigu = true;
          else if (score > meilleurScore) meilleurScore = score;
        }
      }
    }

    if (ambigu) return null;
    if (meilleurId !== null) {
      if (distancePartagee <= meilleureDistance) return null;
      return { id: meilleurId, score: meilleurScore };
    }
    if (distancePartagee !== Infinity) return null;

    if (saisie.length < LONGUEUR_PLANCHER) return null;
    let idInverse = null;
    for (let i = 0; i + 1 < saisie.length; i += 1) {
      if (saisie[i] === saisie[i + 1]) continue;
      const permutee = saisie.slice(0, i) + saisie[i + 1] + saisie[i] + saisie.slice(i + 2);
      const trouvee = index.get(permutee);
      if (!trouvee || trouvee.partagee) continue;
      if (idInverse !== null && idInverse !== trouvee.id) return null;
      idInverse = trouvee.id;
    }
    if (idInverse !== null) return { id: idInverse, score: 1 - 2 / saisie.length };

    return null;
  }

  return { resoudre };
}
