const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const CIBLE = path.join(RACINE, 'sw.js');

const DOSSIERS_LIVRES = ['css', 'js', 'data', 'icones'];
const EXTENSIONS_LIVREES = new Set(['.html', '.css', '.js', '.json', '.png', '.webmanifest']);
const OUTILLAGE = new Set(['package.json', 'package-lock.json', 'sw.js']);

function fichiersLivres() {
  const trouves = [];
  for (const e of fs.readdirSync(RACINE, { withFileTypes: true })) {
    if (e.isFile() && EXTENSIONS_LIVREES.has(path.extname(e.name))) trouves.push(e.name);
  }
  for (const dossier of DOSSIERS_LIVRES) {
    const chemin = path.join(RACINE, dossier);
    if (!fs.existsSync(chemin)) continue;
    for (const e of fs.readdirSync(chemin, { withFileTypes: true })) {
      if (e.isFile() && EXTENSIONS_LIVREES.has(path.extname(e.name))) {
        trouves.push(`${dossier}/${e.name}`);
      }
    }
  }
  return trouves
    .filter((f) => !OUTILLAGE.has(f) && !f.startsWith('_verif-'))
    .sort();
}

function logique(source) {
  return source
    .replace(/const VERSION = '[^']*';/, '')
    .replace(/const RESSOURCES = \[[\s\S]*?\];/, '');
}

function empreinte(ressources, source) {
  const somme = crypto.createHash('sha1');
  somme.update(logique(source));
  for (const r of ressources) {
    somme.update(r);
    somme.update(fs.readFileSync(path.join(RACINE, r)));
  }
  return somme.digest('hex').slice(0, 12);
}

function reecrire(source, ressources, version) {
  const liste = ["  './',"]
    .concat(ressources.map((r) => `  '${r}',`))
    .join('\n');

  const avecVersion = source.replace(
    /const VERSION = '[^']*';/,
    `const VERSION = '${version}';`
  );
  const avecListe = avecVersion.replace(
    /const RESSOURCES = \[[\s\S]*?\];/,
    `const RESSOURCES = [\n${liste}\n];`
  );

  if (avecListe === source) return { source, change: false };
  if (!/const VERSION = '[^']*';/.test(avecListe) || !/const RESSOURCES = \[/.test(avecListe)) {
    console.error('sw.js : VERSION ou RESSOURCES introuvable, rien réécrit');
    process.exit(1);
  }
  return { source: avecListe, change: true };
}

function calculer() {
  const ressources = fichiersLivres();
  const source = fs.readFileSync(CIBLE, 'utf8');
  return { ressources, version: empreinte(ressources, source) };
}

if (require.main === module) {
  const { ressources, version } = calculer();
  const source = fs.readFileSync(CIBLE, 'utf8');
  const { source: sortie, change } = reecrire(source, ressources, version);
  if (change) fs.writeFileSync(CIBLE, sortie);

  console.log('sw.js :');
  console.log(`  ressources     ${ressources.length}`);
  console.log(`  version        ${version}`);
  console.log(`  fichier        ${change ? 'mis à jour' : 'déjà à jour'}`);
}

module.exports = { calculer, fichiersLivres, empreinte };
