// Vérifie la progression persistante, et surtout la sortie de la liste des pays
// ratés après une révision réussie.
//   node build/verifier-stockage.mjs
//
// Sans localStorage, le module tient son état en mémoire : c'est exactement la
// logique qu'on veut éprouver ici, la sérialisation n'entre pas en jeu.

import {
  chargerProgression, enregistrerEchec, oublierEchec, entitesLesPlusRatees,
  enregistrerScore, effacerTout,
} from '../js/stockage.js';

let ok = 0;
let ko = 0;
const v = (nom, cond) => {
  if (cond) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom); }
};

const ratesDe = (id) => chargerProgression().echecs[id];

console.log('— un pays raté entre dans la liste —');
effacerTout();
enregistrerEchec('A');
enregistrerEchec('A');
enregistrerEchec('B');
v('les deux y sont', entitesLesPlusRatees(10).join() === 'A,B');
v('le plus raté vient en tête', entitesLesPlusRatees(1)[0] === 'A');
v('le compteur affiché vaut 2', ratesDe('A') === 2);

console.log('— deviné en révision, il en sort —');
oublierEchec('A');
v('A a disparu de la liste', entitesLesPlusRatees(10).join() === 'B');
v('son compteur ne s\'affiche plus', ratesDe('A') === undefined);
v('B n\'a pas bougé', ratesDe('B') === 1);

console.log('— raté de nouveau, il revient —');
enregistrerEchec('A');
v('A est revenu', entitesLesPlusRatees(10).includes('A'));
v('le compteur repart de 1, pas de 3', ratesDe('A') === 1);
v('un second oubli le ressort', (oublierEchec('A'), !entitesLesPlusRatees(10).includes('A')));

console.log('— oublis sans effet —');
effacerTout();
oublierEchec('JAMAIS-RATE');
v('oublier un pays jamais raté ne crée rien', entitesLesPlusRatees(10).length === 0);
enregistrerEchec('C');
oublierEchec('C');
oublierEchec('C');
v('oublier deux fois ne creuse pas de dette', (enregistrerEchec('C'), ratesDe('C') === 1));
oublierEchec('');
oublierEchec(null);
v('un identifiant vide est ignoré', entitesLesPlusRatees(10).join() === 'C');

console.log('— le reste de la progression n\'est pas touché —');
effacerTout();
enregistrerScore('clef', 80);
enregistrerEchec('D');
oublierEchec('D');
v('le meilleur score survit à un oubli', chargerProgression().meilleurs.clef === 80);
enregistrerScore('clef', 60);
v('un score plus faible n\'écrase pas le meilleur', chargerProgression().meilleurs.clef === 80);

effacerTout();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
