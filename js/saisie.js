// Tolérance orthographique du mode saisie : normalisation des noms,
// distance de Levenshtein et résolution d'une saisie vers une entité.

// Caractères sans décomposition NFD utile : NFD ne les sépare pas en
// lettre + diacritique, il faut donc les traduire à la main.
const EQUIVALENCES = {
  'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'å': 'a', 'ß': 'ss',
  'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i'
};

const APOSTROPHES = /[\u2018\u2019\u201b\u02bc\u02b9\u00b4`]/g;
// Articles initiaux uniquement : « république » et « republic » restent, ils
// distinguent trop de paires (Congo, Corée, Dominicaine...) pour être jetés.
const ARTICLE_INITIAL = /^(?:l['\s]\s*|le\s+|la\s+|les\s+|the\s+)/;

// Environ une faute tolérée par tranche de 5 caractères saisis.
const CARACTERES_PAR_FAUTE = 5;
// En dessous, aucune faute : « mali »/« malte », « inde », « irak »/« iran »
// se confondraient sinon.
const LONGUEUR_PLANCHER = 5;

export function normaliser(texte) {
  if (typeof texte !== 'string') return '';
  let sortie = texte.toLowerCase();
  sortie = sortie.replace(/[æœøåßđðþłı]/g, (c) => EQUIVALENCES[c]);
  sortie = sortie.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  sortie = sortie.replace(APOSTROPHES, "'");
  // Tirets et ponctuation deviennent des espaces : « guinee-bissau » doit
  // s'écrire aussi bien avec un tiret qu'avec une espace.
  sortie = sortie.replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
  sortie = sortie.replace(ARTICLE_INITIAL, '');
  // L'apostrophe restante disparaît en dernier, sinon « l'inde » ne serait
  // plus reconnaissable comme article.
  sortie = sortie.replace(/'/g, ' ').replace(/\s+/g, ' ').trim();
  return sortie;
}

// Levenshtein sur deux tampons de taille min(n, m) + 1.
// seuilMax borne le calcul : au-delà, la fonction rend une valeur
// strictement supérieure au seuil sans terminer le remplissage.
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

  // Une même forme portée par deux entités est marquée « partagée » et cesse
  // d'être exploitable, en exact comme en approché.
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
  // Le fichier d'alias couvre les trois découpages à la fois. Un alias visant
  // une entité absente du jeu courant ne sert à rien, et surtout il marquerait
  // « partagée » la forme d'une entité bien présente : « Inde » disparaîtrait
  // du jeu ONU à cause de l'alias homonyme du découpage subunits.
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

    // Le seuil dépend de ce qui a été tapé, pas de la forme candidate :
    // un candidat court ne peut donc pas capter une saisie courte mal
    // orthographiée au détriment d'un candidat plus long.
    const seuil = seuilPour(saisie.length);

    let meilleurId = null;
    let meilleureDistance = Infinity;
    let meilleurScore = 0;
    let ambigu = false;
    // Une forme partagée ne désigne personne, mais elle doit barrer la route au
    // lieu d'être ignorée : sinon « coree du sod » quitte la Corée du Sud, dont
    // la forme est partagée, pour atterrir sur la Corée du Nord.
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
          // Deux entités distinctes aussi proches : on préfère ne rien rendre
          // plutôt que de trancher au hasard entre Niger et Nigeria.
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

    // Dernier recours : l'inversion de deux lettres voisines (« allemange »)
    // coûte 2 en Levenshtein et passe donc sous le seuil des noms moyens.
    // On ne la retient que si elle retombe sur une forme connue à l'identique.
    // Sous le plancher, en revanche, aucune faute n'est tolérée : l'inversion
    // ne doit pas rouvrir la porte que le seuil vient de fermer, sans quoi
    // « inue », à une lettre de l'Inde, se résout en Niue à deux lettres.
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
