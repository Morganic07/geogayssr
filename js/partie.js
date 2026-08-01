function melanger(tableau) {
  const t = tableau.slice();
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

export function creerPartie({ entites, mode = 'clic', politique = 'une-chance', longueur = null, zone = null }) {
  if (!Array.isArray(entites) || entites.length === 0) {
    throw new Error('creerPartie : aucune entité fournie');
  }
  if (mode !== 'clic' && mode !== 'saisie' && mode !== 'forme') {
    throw new Error(`creerPartie : mode inconnu « ${mode} »`);
  }
  if (politique !== 'une-chance' && politique !== 'rattrapage') {
    throw new Error(`creerPartie : politique inconnue « ${politique} »`);
  }

  const candidates = zone ? entites.filter((e) => e.continent === zone) : entites.slice();
  if (candidates.length === 0) {
    throw new Error(`creerPartie : aucune entité dans la zone « ${zone} »`);
  }

  const voulu = longueur && longueur > 0 ? Math.min(longueur, candidates.length) : candidates.length;
  const questions = melanger(candidates).slice(0, voulu);

  const total = questions.length;
  const parId = new Map(questions.map((e) => [e.id, e]));

  let file = questions.map((e) => ({ id: e.id, estRattrapage: false }));
  let position = 0;
  let demarree = false;

  const resultats = new Map();

  function tourCourant() {
    return position < file.length ? file[position] : null;
  }

  return {
    demarrer() {
      demarree = true;
      position = 0;
      resultats.clear();
      file = questions.map((e) => ({ id: e.id, estRattrapage: false }));
    },

    questionCourante() {
      if (!demarree) return null;
      const tour = tourCourant();
      if (!tour) return null;
      const entite = parId.get(tour.id);
      return {
        id: entite.id,
        fr: entite.fr,
        index: Math.min(resultats.size + 1, total),
        total,
        estRattrapage: tour.estRattrapage,
      };
    },

    repondre(valeur, secondEssai = false) {
      const tour = tourCourant();
      if (!tour) return null;

      const correct = valeur != null && valeur === tour.id;

      if (correct) {
        const duPremierCoup = !tour.estRattrapage && !secondEssai;
        if (!resultats.has(tour.id)) {
          resultats.set(tour.id, duPremierCoup ? 'premier-coup' : 'rattrapage');
        } else {
          resultats.set(tour.id, 'rattrapage');
        }
      } else if (politique === 'rattrapage' && !tour.estRattrapage) {
        file.push({ id: tour.id, estRattrapage: true });
      } else {
        resultats.set(tour.id, 'rate');
      }

      position++;

      return {
        correct,
        attendu: tour.id,
        estRattrapage: tour.estRattrapage,
        secondEssai,
      };
    },

    score() {
      let premierCoup = 0;
      let rattrapage = 0;
      let rates = 0;
      for (const etat of resultats.values()) {
        if (etat === 'premier-coup') premierCoup++;
        else if (etat === 'rattrapage') rattrapage++;
        else rates++;
      }
      return { premierCoup, rattrapage, rates, total };
    },

    estTerminee() {
      return demarree && position >= file.length;
    },

    entitesTrouvees() {
      return [...resultats.entries()]
        .filter(([, etat]) => etat === 'premier-coup')
        .map(([id]) => id);
    },

    entitesRatees() {
      return [...resultats.entries()]
        .filter(([, etat]) => etat === 'rate')
        .map(([id]) => id);
    },

    mode,
    politique,
  };
}
