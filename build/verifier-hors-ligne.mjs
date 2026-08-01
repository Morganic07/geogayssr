import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { calculer } = createRequire(import.meta.url)('./generer-sw.cjs');

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) echecs.push(message);
};

const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8');

console.log('=== sw.js ===');

const sw = lire('sw.js');

const attendu = calculer();

const version = sw.match(/const VERSION = '([^']+)'/);
constate(!!version, version ? `version : ${version[1]}` : 'constante VERSION introuvable');
constate(!!version && version[1] === attendu.version,
  version && version[1] === attendu.version
    ? 'la version correspond au contenu réel des fichiers'
    : `version périmée : ${version ? version[1] : '?'} au lieu de ${attendu.version}`
      + ' — lance « npm run sw », sinon les appareils garderont l\'ancienne version');

const bloc = sw.match(/const RESSOURCES = \[([\s\S]*?)\];/);
if (!bloc) {
  console.error('sw.js : liste RESSOURCES introuvable');
  process.exit(1);
}
const listees = [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const listeesSansRacine = listees.filter((r) => r !== './');

constate(listees.includes('./'), 'la racine « ./ » est dans la liste');
constate(new Set(listees).size === listees.length, 'aucun doublon dans la liste');

const absentes = listeesSansRacine.filter((r) => !existsSync(path.join(RACINE, r)));
constate(absentes.length === 0,
  absentes.length === 0
    ? `les ${listeesSansRacine.length} ressources listées existent`
    : `ressources listées mais absentes du dépôt : ${absentes.join(', ')}`);


console.log('\n=== couverture ===');

const manquantes = attendu.ressources.filter((r) => !listees.includes(r));
constate(manquantes.length === 0,
  manquantes.length === 0
    ? `les ${attendu.ressources.length} fichiers livrés au navigateur sont tous en cache`
    : `livrés mais absents du cache, donc indisponibles hors ligne : ${manquantes.join(', ')}`);

const surnumeraires = listeesSansRacine.filter((r) => !attendu.ressources.includes(r));
constate(surnumeraires.length === 0,
  surnumeraires.length === 0
    ? 'aucune ressource en trop dans la liste'
    : `en cache mais plus livrées : ${surnumeraires.join(', ')}`);


console.log('\n=== index.html ===');

const index = lire('index.html');
const maj = lire('js/maj.js');
constate(/serviceWorker\.register\(\s*'sw\.js'\s*\)/.test(maj), 'le service worker est enregistré');
constate(/activerHorsLigne\(\)/.test(lire('js/main.js')), 'main.js appelle activerHorsLigne()');
constate(/id="maj-disponible"/.test(index) && /id="bouton-maj"/.test(index),
  'la proposition de mise à jour est présente dans la page');
constate(/rel="manifest"\s+href="manifest\.webmanifest"/.test(index), 'le manifeste est référencé');

const referencees = [
  ...[...index.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ...[...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
].filter((r) => !r.startsWith('http') && !r.startsWith('//'));

const nonCouvertes = referencees.filter((r) => !listees.includes(r));
constate(nonCouvertes.length === 0,
  nonCouvertes.length === 0
    ? `les ${referencees.length} ressources liées par index.html sont en cache`
    : `liées par index.html mais pas en cache : ${nonCouvertes.join(', ')}`);


console.log('\n=== manifest.webmanifest ===');

let manifeste = null;
try {
  manifeste = JSON.parse(lire('manifest.webmanifest'));
  constate(true, 'JSON valide');
} catch (e) {
  constate(false, `JSON invalide : ${e.message}`);
}

if (manifeste) {
  constate(manifeste.orientation === 'landscape',
    `orientation : ${manifeste.orientation} (attendu landscape)`);
  constate(manifeste.display === 'standalone', `affichage : ${manifeste.display}`);
  constate(manifeste.start_url === '.' && manifeste.scope === '.',
    'start_url et scope relatifs, donc valides sous un sous-chemin GitHub Pages');

  const icones = manifeste.icons || [];
  const iconesAbsentes = icones.map((i) => i.src).filter((s) => !existsSync(path.join(RACINE, s)));
  constate(icones.length > 0 && iconesAbsentes.length === 0,
    iconesAbsentes.length === 0
      ? `les ${icones.length} icônes du manifeste existent`
      : `icônes déclarées mais absentes : ${iconesAbsentes.join(', ')}`);

  const iconesEnCache = icones.map((i) => i.src).filter((s) => !listees.includes(s));
  constate(iconesEnCache.length === 0,
    iconesEnCache.length === 0
      ? 'les icônes du manifeste sont en cache'
      : `icônes hors cache : ${iconesEnCache.join(', ')}`);

  const pomme = index.match(/rel="apple-touch-icon"\s+href="([^"]+)"/);
  constate(!!pomme && existsSync(path.join(RACINE, pomme[1])),
    pomme ? `icône iOS : ${pomme[1]}` : 'aucune icône apple-touch-icon');
}

console.log(echecs.length === 0
  ? '\nLe jeu est complet hors ligne.'
  : `\n${echecs.length} manquement(s) au contrat hors ligne.`);
process.exit(echecs.length === 0 ? 0 : 1);
