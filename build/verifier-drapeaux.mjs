import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DONNEES = path.join(RACINE, 'data');

const CARTES = ['onu', 'units', 'subunits'];
const ATTENDU_ONU = 197;

let ok = 0;
let ko = 0;
const v = (nom, cond) => {
  if (cond) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom); }
};

const fichier = path.join(DONNEES, 'drapeaux.json');
if (!existsSync(fichier)) {
  console.error('data/drapeaux.json absent : lance « npm run donnees »');
  process.exit(1);
}

const { format, drapeaux } = JSON.parse(readFileSync(fichier, 'utf8'));
const codes = Object.keys(drapeaux);

console.log('=== data/drapeaux.json ===');
v(`${codes.length} images`, codes.length > 0);
v('format annoncé : image/webp', format === 'image/webp');

// Une image tronquée ou d'un autre format passerait le JSON sans broncher, et ne
// se verrait qu'à l'écran, une question sur deux.
const entetesValides = codes.filter((c) => {
  const octets = Buffer.from(drapeaux[c], 'base64');
  return octets.length > 12
    && octets.subarray(0, 4).toString('latin1') === 'RIFF'
    && octets.subarray(8, 12).toString('latin1') === 'WEBP';
});
v('toutes les images sont bien du WebP', entetesValides.length === codes.length);

const utilises = new Set();

for (const carte of CARTES) {
  console.log(`\n=== carte-${carte}.json ===`);
  const { entites } = JSON.parse(readFileSync(path.join(DONNEES, `carte-${carte}.json`), 'utf8'));
  const avecDrapeau = entites.filter((e) => e.drapeau);

  const sansImage = avecDrapeau.filter((e) => !drapeaux[e.drapeau]);
  v(`${avecDrapeau.length} entités jouables au drapeau`,
    avecDrapeau.length > 0);
  v(sansImage.length === 0
    ? 'chaque drapeau annoncé a son image'
    : `images manquantes : ${sansImage.map((e) => `${e.fr} (${e.drapeau})`).join(', ')}`,
    sansImage.length === 0);

  // Deux entités d'une même carte sous le même drapeau rendraient la question
  // insoluble : l'une des deux réponses serait comptée fausse à tort.
  const parCode = new Map();
  for (const e of avecDrapeau) {
    if (!parCode.has(e.drapeau)) parCode.set(e.drapeau, []);
    parCode.get(e.drapeau).push(e.fr);
    utilises.add(e.drapeau);
  }
  const partages = [...parCode.entries()].filter(([, noms]) => noms.length > 1);
  v(partages.length === 0
    ? 'aucun drapeau ne désigne deux entités'
    : `drapeaux ambigus : ${partages.map(([c, n]) => `${c} = ${n.join(' / ')}`).join(' ; ')}`,
    partages.length === 0);

  if (carte === 'onu') {
    v(`les ${ATTENDU_ONU} pays de l'ONU ont tous un drapeau`,
      avecDrapeau.length === ATTENDU_ONU);
  }
}

console.log('\n=== poids mort ===');
const inutiles = codes.filter((c) => !utilises.has(c));
v(inutiles.length === 0
  ? 'aucune image que les cartes n\'utilisent'
  : `images jamais montrées, à retirer : ${inutiles.join(', ')}`,
  inutiles.length === 0);

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko === 0 ? 0 : 1);
