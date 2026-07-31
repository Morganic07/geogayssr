import { readFileSync } from 'fs';
import { normaliser, creerResolveur } from '../js/saisie.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => JSON.parse(readFileSync(RACINE + f, 'utf8'));

const alias = lire('data/alias.json');
const PERIMETRES = ['onu', 'units', 'subunits'];

const PIEGES = [
  ['Niger', 'Nigeria'], ['Guinée', 'Guinée-Bissau'], ['Guinée', 'Guinée équatoriale'],
  ['Corée du Nord', 'Corée du Sud'], ['Soudan', 'Soudan du Sud'],
  ['Irlande', 'Islande'], ['Autriche', 'Australie'], ['Chine', 'Chili'],
  ['Mali', 'Malte'], ['Slovaquie', 'Slovénie'], ['Inde', 'Indonésie'],
  ['Zambie', 'Gambie'], ['Iran', 'Irak'], ['Guyana', 'Guyane'],
];

let echecs = 0;
const signaler = (m) => { echecs++; console.log('  ✗ ' + m); };

for (const perimetre of PERIMETRES) {
  const donnees = lire(`data/carte-${perimetre}.json`);
  const entites = donnees.entites;
  const resolveur = creerResolveur(entites, alias);
  const parId = new Map(entites.map((e) => [e.id, e]));

  console.log(`\n=== ${perimetre} (${entites.length} entités) ===`);

  let nomsKo = 0;
  for (const e of entites) {
    for (const champ of ['fr', 'en']) {
      const r = resolveur.resoudre(e[champ]);
      if (!r || r.id !== e.id) {
        nomsKo++;
        if (nomsKo <= 5) {
          signaler(`« ${e[champ]} » (${e.id}) → ${r ? r.id + ' / ' + parId.get(r.id)?.fr : 'null'}`);
        }
      }
    }
  }
  if (nomsKo > 5) signaler(`… et ${nomsKo - 5} autres noms officiels non résolus`);
  if (nomsKo === 0) console.log('  ✓ les ' + entites.length * 2 + ' noms officiels (fr + en) résolvent');

  let aliasKo = 0;
  for (const [id, formes] of Object.entries(alias)) {
    if (!parId.has(id)) continue;
    for (const forme of formes) {
      const r = resolveur.resoudre(forme);
      if (!r || r.id !== id) {
        aliasKo++;
        if (aliasKo <= 5) signaler(`alias « ${forme} » (${id}) → ${r ? r.id : 'null'}`);
      }
    }
  }
  if (aliasKo > 5) signaler(`… et ${aliasKo - 5} autres alias non résolus`);
  if (aliasKo === 0) console.log('  ✓ tous les alias du périmètre résolvent');

  const nomsPresents = new Map(entites.map((e) => [normaliser(e.fr), e.id]));
  let piegesKo = 0;
  let piegesTestes = 0;
  for (const [a, b] of PIEGES) {
    const ida = nomsPresents.get(normaliser(a));
    const idb = nomsPresents.get(normaliser(b));
    if (!ida || !idb || ida === idb) continue;
    piegesTestes++;
    const ra = resolveur.resoudre(a);
    const rb = resolveur.resoudre(b);
    if (!ra || ra.id !== ida) { piegesKo++; signaler(`« ${a} » → ${ra ? ra.id : 'null'} au lieu de ${ida}`); }
    if (!rb || rb.id !== idb) { piegesKo++; signaler(`« ${b} » → ${rb ? rb.id : 'null'} au lieu de ${idb}`); }
  }
  if (piegesKo === 0) console.log(`  ✓ ${piegesTestes} paire(s) piège testée(s), aucune confondue`);

  const FAUTES = [
    ['allemagne', 'Allemagne'], ['Allemange', 'Allemagne'], ['ALLEMAGNE', 'Allemagne'],
    ['germany', 'Allemagne'], ['etats unis', null], ['USA', null],
    ['birmanie', null], ['cote divoire', null], ['republique tcheque', null],
  ];
  let fautesKo = 0;
  for (const [saisie, attenduFr] of FAUTES) {
    const r = resolveur.resoudre(saisie);
    if (!r) { fautesKo++; signaler(`« ${saisie} » → null`); continue; }
    if (attenduFr && parId.get(r.id)?.fr !== attenduFr) {
      fautesKo++;
      signaler(`« ${saisie} » → ${parId.get(r.id)?.fr} au lieu de ${attenduFr}`);
    }
  }
  if (fautesKo === 0) console.log('  ✓ les fautes de frappe courantes sont rattrapées');

  const vues = new Map();
  let collisions = 0;
  for (const e of entites) {
    for (const forme of [e.fr, e.en, ...(alias[e.id] || [])]) {
      const n = normaliser(forme);
      if (!n) continue;
      if (vues.has(n) && vues.get(n) !== e.id) {
        collisions++;
        if (collisions <= 5) signaler(`« ${n} » désigne ${vues.get(n)} et ${e.id}`);
      }
      vues.set(n, e.id);
    }
  }
  if (collisions === 0) console.log('  ✓ aucune forme ambiguë dans le périmètre');
}

console.log(echecs === 0 ? '\nTout est vert.' : `\n${echecs} problème(s).`);
process.exit(echecs === 0 ? 0 : 1);
