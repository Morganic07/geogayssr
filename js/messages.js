// Messages de fin de partie.
//
// Pour modifier les textes, tout se passe dans le tableau PALIERS ci-dessous et
// nulle part ailleurs. Chaque palier est un seuil en pourcentage et une liste de
// textes ; un score déclenche le premier palier dont le seuil lui est inférieur ou
// égal. Ajouter un texte = ajouter une chaîne à la liste ; ajouter un palier =
// insérer un objet { seuil, textes } en gardant les seuils en ordre décroissant.
// Le dernier palier doit rester à 0 pour couvrir les scores les plus bas.

const PALIERS = [
  {
    seuil: 100,
    textes: [
      'Sans faute.',
      'Aucune erreur.',
      'Parcours parfait.'
    ]
  },
  {
    seuil: 90,
    textes: [
      'Très belle partie.',
      'Presque parfait.',
      'Il ne manquait pas grand-chose.'
    ]
  },
  {
    seuil: 75,
    textes: [
      'Belle partie.',
      'Bon résultat.',
      'La carte commence à être connue.'
    ]
  },
  {
    seuil: 50,
    textes: [
      'Plus de la moitié.',
      'Résultat honorable.',
      'Encore quelques régions à revoir.'
    ]
  },
  {
    seuil: 25,
    textes: [
      'Le début est là.',
      'Il reste du terrain à couvrir.',
      'Une partie de plus et ça progressera.'
    ]
  },
  {
    seuil: 0,
    textes: [
      'La prochaine sera meilleure.',
      'Partie difficile.',
      'À retenter.'
    ]
  }
];

// Filet de sécurité : si PALIERS est mal édité (aucun palier atteint, liste de
// textes vide), la fonction renvoie ceci plutôt qu'une valeur vide.
const TEXTE_PAR_DEFAUT = 'Partie terminée.';

function choisirAuHasard(textes) {
  if (!Array.isArray(textes) || textes.length === 0) return TEXTE_PAR_DEFAUT;
  return textes[Math.floor(Math.random() * textes.length)];
}

export function messagePourScore(pourcentage) {
  const valeur = Number(pourcentage);
  // Un NaN ne satisfait aucune comparaison : on le ramène au plus bas palier.
  const borne = Number.isFinite(valeur) ? Math.min(100, Math.max(0, valeur)) : 0;

  for (const palier of PALIERS) {
    if (borne >= palier.seuil) return choisirAuHasard(palier.textes);
  }
  return TEXTE_PAR_DEFAUT;
}
