const PALIERS = [
  {
    seuil: 100,
    textes: [
      'Sans faute, bravo ma chérie.',
      'Aucune erreur, je vais marier un robot ou une humaine wsh.',
      'Parcours parfait, fait question pour un champion tu as tes chances'
    ]
  },
  {
    seuil: 90,
    textes: [
      'Très belle partie, tu es ma petite championne.',
      'Presque parfait mais au moins toi tu es parfaite.',
      'Il ne manquait pas grand-chose, demande de l\'aide à la Grande Morgane.'
    ]
  },
  {
    seuil: 75,
    textes: [
      'Belle partie ma chérie, tu peux refaire pour te perfectionner.',
      'Bon résultat, c\'est déjà pas mal.',
      'La carte commence à être connue.'
    ]
  },
  {
    seuil: 50,
    textes: [
      'Plus de la moitié. Il te manque l\'autre moitié lol. ',
      'Résultat pas à ton niveau, refait et impresionne moi.',
      'Tu peux faire mieux, je le sens je le sais je le suis'
    ]
  },
  {
    seuil: 25,
    textes: [
      'Eva wsh ? Progresser c\'est pas mal, mais faut s\'accrocher.',
      'Il reste du terrain à couvrir, faut s\'accrocher.',
      'Aller joue sérieusement, tu peux faire mieux.'
    ]
  },
  {
    seuil: 0,
    textes: [
      'Tu fais expres ou quoient.',
      'Bah ma chérie ?? j\'ai vu mieux.',
      'À retenter tu joues à quoi là ?'
    ]
  }
];

const TEXTE_PAR_DEFAUT = 'Partie terminée.';

function choisirAuHasard(textes) {
  if (!Array.isArray(textes) || textes.length === 0) return TEXTE_PAR_DEFAUT;
  return textes[Math.floor(Math.random() * textes.length)];
}

export function messagePourScore(pourcentage) {
  const valeur = Number(pourcentage);
  const borne = Number.isFinite(valeur) ? Math.min(100, Math.max(0, valeur)) : 0;

  for (const palier of PALIERS) {
    if (borne >= palier.seuil) return choisirAuHasard(palier.textes);
  }
  return TEXTE_PAR_DEFAUT;
}
