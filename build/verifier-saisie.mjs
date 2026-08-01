import { readFileSync } from 'fs';
import { normaliser, creerResolveur } from '../js/saisie.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => JSON.parse(readFileSync(RACINE + f, 'utf8'));

const alias = lire('data/alias.json');
const PERIMETRES = [
  { nom: 'onu', fichier: 'onu' },
  { nom: 'units', fichier: 'units' },
  { nom: 'subunits', fichier: 'subunits' },
  { nom: 'hors-onu', fichier: 'subunits', jouable: (e) => e.horsOnu === true },
];

const PIEGES = [
  ['Niger', 'Nigeria'], ['Guinée', 'Guinée-Bissau'], ['Guinée', 'Guinée équatoriale'],
  ['Corée du Nord', 'Corée du Sud'], ['Soudan', 'Soudan du Sud'],
  ['Irlande', 'Islande'], ['Autriche', 'Australie'], ['Chine', 'Chili'],
  ['Mali', 'Malte'], ['Slovaquie', 'Slovénie'], ['Inde', 'Indonésie'],
  ['Zambie', 'Gambie'], ['Iran', 'Irak'], ['Guyana', 'Guyane'],
];

const NOMS_ONU = lire('data/carte-onu.json').entites.map((e) => e.fr);

let echecs = 0;
const signaler = (m) => { echecs++; console.log('  ✗ ' + m); };

for (const perimetre of PERIMETRES) {
  const donnees = lire(`data/carte-${perimetre.fichier}.json`);
  const entites = perimetre.jouable ? donnees.entites.filter(perimetre.jouable) : donnees.entites;
  const resolveur = creerResolveur(donnees.entites, alias);
  const parId = new Map(donnees.entites.map((e) => [e.id, e]));
  const jouables = new Set(entites.map((e) => e.id));

  console.log(`\n=== ${perimetre.nom} (${entites.length} entités) ===`);
  if (entites.length === 0) {
    signaler('périmètre vide');
    continue;
  }

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
    ['allemagne', 'Allemagne', 'Allemagne'], ['Allemange', 'Allemagne', 'Allemagne'],
    ['ALLEMAGNE', 'Allemagne', 'Allemagne'], ['germany', 'Allemagne', 'Allemagne'],
    ['etats unis', null, 'États-Unis'], ['USA', null, 'États-Unis'],
    ['birmanie', null, 'Birmanie'], ['cote divoire', null, "Côte d'Ivoire"],
    ['republique tcheque', null, 'Tchéquie'],
  ];
  let fautesKo = 0;
  let fautesTestees = 0;
  for (const [saisie, attenduFr, reference] of FAUTES) {
    if (!nomsPresents.has(normaliser(reference))) continue;
    fautesTestees++;
    const r = resolveur.resoudre(saisie);
    if (!r) { fautesKo++; signaler(`« ${saisie} » → null`); continue; }
    if (attenduFr && parId.get(r.id)?.fr !== attenduFr) {
      fautesKo++;
      signaler(`« ${saisie} » → ${parId.get(r.id)?.fr} au lieu de ${attenduFr}`);
    }
  }
  if (fautesKo === 0) {
    console.log(`  ✓ ${fautesTestees} faute(s) de frappe courante(s) rattrapée(s)`);
  }

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

  if (perimetre.nom === 'hors-onu') {
    let onuKo = 0;
    let onuTestes = 0;
    for (const nom of NOMS_ONU) {
      if (nomsPresents.has(normaliser(nom))) continue;
      onuTestes++;
      const r = resolveur.resoudre(nom);
      if (!r || !jouables.has(r.id)) continue;
      onuKo++;
      if (onuKo <= 5) signaler(`« ${nom} », pays de l'ONU, est accepté ici → ${parId.get(r.id)?.fr}`);
    }
    if (onuKo > 5) signaler(`… et ${onuKo - 5} autres pays de l'ONU acceptés`);
    if (onuKo === 0) console.log(`  ✓ les ${onuTestes} pays de l'ONU absents d'ici ne résolvent pas`);
  }
}

console.log('\n=== capitales ===');
{
  const onu = lire('data/carte-onu.json');
  const avec = onu.entites.filter((e) => e.capitale);
  console.log(`  ✓ ${avec.length} pays sur ${onu.entites.length} ont une capitale`);

  const formes = avec.flatMap((e) => e.capitale.noms.map((nom) => ({ id: e.id, fr: nom, en: nom })));
  const resolveur = creerResolveur(formes, {});
  const parId = new Map(onu.entites.map((e) => [e.id, e]));

  let ko = 0;
  for (const f of formes) {
    const r = resolveur.resoudre(f.fr);
    if (!r || r.id !== f.id) {
      ko++;
      if (ko <= 5) signaler(`« ${f.fr} » (${parId.get(f.id).fr}) → ${r ? parId.get(r.id)?.fr : 'null'}`);
    }
  }
  if (ko > 5) signaler(`… et ${ko - 5} autres capitales non résolues`);
  if (ko === 0) console.log(`  ✓ les ${formes.length} formes acceptées résolvent vers leur pays`);

  const vues = new Map();
  let collisions = 0;
  for (const f of formes) {
    const n = normaliser(f.fr);
    if (vues.has(n) && vues.get(n) !== f.id) {
      collisions++;
      signaler(`« ${f.fr} » désigne ${parId.get(vues.get(n)).fr} et ${parId.get(f.id).fr}`);
    }
    vues.set(n, f.id);
  }
  if (collisions === 0) console.log('  ✓ aucune capitale ambiguë entre deux pays');

  const sansPoint = avec.filter((e) => !Array.isArray(e.capitale.point) || e.capitale.point.length !== 2);
  if (sansPoint.length) signaler(`${sansPoint.length} capitale(s) sans position`);
  else console.log('  ✓ toutes les capitales ont une position sur la carte');
}

console.log(echecs === 0 ? '\nTout est vert.' : `\n${echecs} problème(s).`);
process.exit(echecs === 0 ? 0 : 1);
