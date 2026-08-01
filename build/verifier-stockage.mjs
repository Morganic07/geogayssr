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


console.log('— une progression d\'avant la séparation par mode —');

function stockageFactice(contenu) {
  const donnees = new Map(Object.entries(contenu));
  return {
    getItem: (c) => (donnees.has(c) ? donnees.get(c) : null),
    setItem: (c, v) => donnees.set(c, String(v)),
    removeItem: (c) => donnees.delete(c),
  };
}

const CLE_STOCKAGE = 'geogayssr.progression';
let generation = 0;

async function relireAvec(charge) {
  globalThis.localStorage = stockageFactice({ [CLE_STOCKAGE]: JSON.stringify(charge) });
  generation++;
  return import(`../js/stockage.js?relecture=${generation}`);
}

const ancienne = await relireAvec({
  version: 1,
  meilleurs: { 'clic|onu|monde|10': 90 },
  echecs: { FRA: 3, 'capitale:ESP': 2 },
  oublis: { FRA: 1 },
});
const relue = ancienne.chargerProgression();
v('les meilleurs scores traversent la migration', relue.meilleurs['clic|onu|monde|10'] === 90);
v('les anciennes erreurs sont abandonnées', Object.keys(relue.echecs).length === 0);
v('aucune ancienne clé ne ressort du classement', ancienne.entitesLesPlusRatees(10).length === 0);

const courante = await relireAvec({
  version: 2,
  meilleurs: {},
  echecs: { 'clic|FRA': 2, 'forme|FRA': 1 },
  oublis: {},
});
const gardees = courante.chargerProgression().echecs;
v('une progression déjà séparée est conservée telle quelle',
  gardees['clic|FRA'] === 2 && gardees['forme|FRA'] === 1);
v('le même pays compte séparément dans deux modes',
  courante.entitesLesPlusRatees(10).join() === 'clic|FRA,forme|FRA');

const inconnue = await relireAvec({ version: 99, meilleurs: { clef: 50 }, echecs: {}, oublis: {} });
v('une version inconnue est rejetée en bloc',
  Object.keys(inconnue.chargerProgression().meilleurs).length === 0);

delete globalThis.localStorage;

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
