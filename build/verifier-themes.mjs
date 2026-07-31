// Garde-fou du contrat entre base.css et les feuilles de thème.
//
// La promesse « les thèmes partagent exactement la même mise en page » ne tient
// que si les feuilles de thème restent de simples jeux de variables. Une seule
// propriété de mise en page glissée dans l'une d'elles suffit à la rompre, et la
// divergence ne se voit qu'en comparant les deux rendus côte à côte — c'est
// précisément comme cela que les deux feuilles complètes précédentes avaient
// dérivé sans que personne ne s'en aperçoive.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'css');

// Variables posées ailleurs que dans :root et donc légitimement absentes.
const POSEES_AILLEURS = new Set([
  '--avancement',   // écrite par main.js sur #progression à chaque question
]);

const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) echecs.push(message);
};

// --------------------------------------------------------------- base.css

const base = sansCommentaires(readFileSync(path.join(DOSSIER, 'base.css'), 'utf8'));

const blocRacine = base.match(/:root\s*\{([\s\S]*?)\}/);
if (!blocRacine) {
  console.error('base.css ne contient aucun bloc :root');
  process.exit(1);
}
const declareesBase = new Set([...blocRacine[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

console.log('=== base.css ===');
constate(declareesBase.size > 0, `${declareesBase.size} variables déclarées dans :root`);

// Toute variable consommée doit avoir une valeur de repli quelque part, sinon un
// thème qui l'oublie produit une propriété invalide et un rendu cassé.
const utilisees = new Set([...base.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
const orphelines = [...utilisees].filter((v) => !declareesBase.has(v) && !POSEES_AILLEURS.has(v));
constate(orphelines.length === 0,
  orphelines.length === 0
    ? 'toute variable utilisée a un repli dans :root'
    : `variables sans repli : ${orphelines.join(', ')}`);

// --------------------------------------------------------- feuilles de thème

const themes = readdirSync(DOSSIER).filter((f) => f.startsWith('theme-') && f.endsWith('.css'));
constate(themes.length >= 2, `${themes.length} feuilles de thème trouvées`);

for (const fichier of themes) {
  console.log(`\n=== ${fichier} ===`);
  const src = sansCommentaires(readFileSync(path.join(DOSSIER, fichier), 'utf8'));

  // Un thème ne contient qu'un bloc :root. Tout le reste — sélecteur, @media,
  // @keyframes — est de la mise en page déguisée.
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

  // Une variable que base.css ne connaît pas ne sert à rien : soit elle a été
  // renommée dans base et oubliée ici, soit elle est morte.
  const declareesTheme = [...new Set([...src.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))];
  const inconnues = declareesTheme.filter((v) => !declareesBase.has(v));
  constate(inconnues.length === 0,
    inconnues.length === 0
      ? `${declareesTheme.length} variables, toutes connues de base.css`
      : `variables inconnues de base.css : ${inconnues.join(', ')}`);
}

console.log(echecs.length === 0
  ? '\nLe contrat base / thème est respecté.'
  : `\n${echecs.length} manquement(s) au contrat base / thème.`);
process.exit(echecs.length === 0 ? 0 : 1);
