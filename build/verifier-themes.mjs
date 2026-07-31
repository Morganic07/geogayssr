import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'css');

const POSEES_AILLEURS = new Set([
  '--avancement',
]);

const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) echecs.push(message);
};


const base = sansCommentaires(readFileSync(path.join(DOSSIER, 'base.css'), 'utf8'));

const blocRacine = base.match(/:root\s*\{([\s\S]*?)\}/);
if (!blocRacine) {
  console.error('base.css ne contient aucun bloc :root');
  process.exit(1);
}
const declareesBase = new Set([...blocRacine[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const utilisees = new Set([...base.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
const REQUIS = [...utilisees].filter((v) => !declareesBase.has(v) && !POSEES_AILLEURS.has(v)).sort();

console.log('=== base.css ===');
constate(declareesBase.size > 0, `${declareesBase.size} constantes de mise en page dans :root`);

constate(REQUIS.length > 0, `${REQUIS.length} variables à fournir par chaque thème`);


const themes = readdirSync(DOSSIER).filter((f) => f.startsWith('theme-') && f.endsWith('.css'));
constate(themes.length >= 2, `${themes.length} feuilles de thème trouvées`);

for (const fichier of themes) {
  console.log(`\n=== ${fichier} ===`);
  const src = sansCommentaires(readFileSync(path.join(DOSSIER, fichier), 'utf8'));

  const blocs = [...src.matchAll(/([^{}]*)\{([^{}]*)\}/g)];
  const intrus = blocs.map((b) => b[1].trim()).filter((s) => s !== ':root');
  constate(intrus.length === 0,
    intrus.length === 0
      ? 'aucun sélecteur autre que :root'
      : `sélecteurs interdits : ${intrus.join(' | ')}`);

  const horsBloc = src.replace(/[^{}]*\{[^{}]*\}/g, '').trim();
  constate(horsBloc === '', horsBloc === '' ? 'rien en dehors des blocs' : `résidu hors bloc : ${horsBloc}`);

  const declarations = blocs.flatMap((b) => [...b[2].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
  const nonVariables = [...new Set(declarations.filter((d) => !d.startsWith('--')))];
  constate(nonVariables.length === 0,
    nonVariables.length === 0
      ? 'que des variables, aucune propriété CSS'
      : `propriétés de mise en page : ${nonVariables.join(', ')}`);

  const declareesTheme = new Set([...src.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const manquantes = REQUIS.filter((v) => !declareesTheme.has(v));
  constate(manquantes.length === 0,
    manquantes.length === 0
      ? `les ${REQUIS.length} variables attendues sont toutes fournies`
      : `variables manquantes, le rendu serait cassé : ${manquantes.join(', ')}`);

  const redefinies = [...declareesTheme].filter((v) => declareesBase.has(v));
  constate(redefinies.length === 0,
    redefinies.length === 0
      ? 'aucune constante de base.css redéfinie ici'
      : `constantes de base.css écrasées, donc mortes dans base.css : ${redefinies.join(', ')}`);

  const inutiles = [...declareesTheme].filter((v) => !REQUIS.includes(v) && !declareesBase.has(v));
  constate(inutiles.length === 0,
    inutiles.length === 0
      ? 'aucune variable que base.css n\'utilise pas'
      : `variables mortes, jamais lues par base.css : ${inutiles.join(', ')}`);
}

console.log(echecs.length === 0
  ? '\nLe contrat base / thème est respecté.'
  : `\n${echecs.length} manquement(s) au contrat base / thème.`);
process.exit(echecs.length === 0 ? 0 : 1);
