// Moteur de jeu : construit la pile de questions, séquence les tours, tient le score.
//
// Ce module ne connaît ni la carte ni le champ de saisie. Il reçoit un identifiant
// d'entité en réponse et dit si c'est le bon. La résolution d'un texte tapé vers un
// identifiant est le travail de saisie.js, faite en amont par l'appelant.

// Mélange de Fisher-Yates. Le tri par clé aléatoire, souvent employé à la place,
// ne produit pas une permutation uniforme.
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
  if (mode !== 'clic' && mode !== 'saisie') {
    throw new Error(`creerPartie : mode inconnu « ${mode} »`);
  }
  if (politique !== 'une-chance' && politique !== 'rattrapage') {
    throw new Error(`creerPartie : politique inconnue « ${politique} »`);
  }

  const candidates = zone ? entites.filter((e) => e.continent === zone) : entites.slice();
  if (candidates.length === 0) {
    throw new Error(`creerPartie : aucune entité dans la zone « ${zone} »`);
  }

  // longueur null, 0 ou supérieure au disponible : on prend tout ce qu'il y a.
  const voulu = longueur && longueur > 0 ? Math.min(longueur, candidates.length) : candidates.length;
  const questions = melanger(candidates).slice(0, voulu);

  const total = questions.length;
  const parId = new Map(questions.map((e) => [e.id, e]));

  // File des tours à jouer. En politique de rattrapage, un raté y est réinjecté
  // une seule fois : sans cette limite, une entité jamais trouvée boucle sans fin.
  let file = questions.map((e) => ({ id: e.id, estRattrapage: false }));
  let position = 0;
  let demarree = false;

  const resultats = new Map(); // id -> 'premier-coup' | 'rattrapage' | 'rate'

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
        // L'index affiché suit les entités distinctes déjà tranchées, pas la position
        // dans la file : sinon un rattrapage ferait afficher « 23 / 20 ».
        index: Math.min(resultats.size + 1, total),
        total,
        estRattrapage: tour.estRattrapage,
      };
    },

    repondre(valeur) {
      const tour = tourCourant();
      if (!tour) return null;

      const correct = valeur != null && valeur === tour.id;

      if (correct) {
        // Une entité déjà classée « rattrapage » ne redevient pas « premier coup ».
        if (!resultats.has(tour.id)) {
          resultats.set(tour.id, tour.estRattrapage ? 'rattrapage' : 'premier-coup');
        } else {
          resultats.set(tour.id, 'rattrapage');
        }
      } else if (politique === 'rattrapage' && !tour.estRattrapage) {
        // Raté au premier passage : on le remet en fin de file, sans le classer
        // encore — son sort se décidera au second passage.
        file.push({ id: tour.id, estRattrapage: true });
      } else {
        resultats.set(tour.id, 'rate');
      }

      position++;

      return {
        correct,
        attendu: tour.id,
        estRattrapage: tour.estRattrapage,
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
      // Les entités encore en attente de rattrapage ne sont pas comptées comme
      // ratées tant que la partie n'est pas finie.
      return { premierCoup, rattrapage, rates, total };
    },

    estTerminee() {
      return demarree && position >= file.length;
    },

    // Devinées sans aide, au premier passage. Une entité rattrapée après avoir vu
    // la solution n'en fait pas partie : elle n'a pas été devinée, elle a été
    // montrée. C'est ce qui décide de la sortie de la liste des pays ratés.
    entitesTrouvees() {
      return [...resultats.entries()]
        .filter(([, etat]) => etat === 'premier-coup')
        .map(([id]) => id);
    },

    // Sert à alimenter l'écran de fin et le compteur d'échecs persistant.
    entitesRatees() {
      return [...resultats.entries()]
        .filter(([, etat]) => etat === 'rate')
        .map(([id]) => id);
    },

    mode,
    politique,
  };
}
