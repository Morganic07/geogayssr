import { creerPartie } from '../js/partie.js';

const ENTITES = [
  { id: 'A', fr: 'A', continent: 'Europe' },
  { id: 'B', fr: 'B', continent: 'Europe' },
  { id: 'C', fr: 'C', continent: 'Asia' },
];

let ok = 0;
let ko = 0;
const v = (nom, cond) => {
  if (cond) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom); }
};

console.log('— une seule chance, tout juste —');
let p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
while (!p.estTerminee()) p.repondre(p.questionCourante().id);
v('3 au premier coup', p.score().premierCoup === 3);
v('0 raté', p.score().rates === 0);

console.log('— une seule chance, tout faux —');
p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
while (!p.estTerminee()) p.repondre('MAUVAIS');
v('3 ratés', p.score().rates === 3);
v('les 3 sont listés', p.entitesRatees().length === 3);

console.log('— rattrapage : raté puis retrouvé —');
p = creerPartie({ entites: ENTITES, politique: 'rattrapage' });
p.demarrer();
let tours = 0;
const indexVus = new Set();
while (!p.estTerminee() && tours < 30) {
  const q = p.questionCourante();
  indexVus.add(q.index);
  p.repondre(q.estRattrapage ? q.id : 'MAUVAIS');
  tours++;
}
v('terminée sans boucle infinie', p.estTerminee());
v('3 au rattrapage', p.score().rattrapage === 3);
v('0 au premier coup', p.score().premierCoup === 0);
v('index jamais supérieur au total', Math.max(...indexVus) <= 3);

console.log('— rattrapage : raté deux fois —');
p = creerPartie({ entites: ENTITES, politique: 'rattrapage' });
p.demarrer();
tours = 0;
while (!p.estTerminee() && tours < 30) { p.repondre('MAUVAIS'); tours++; }
v('terminée', p.estTerminee());
v('3 ratés', p.score().rates === 3);
v('chaque entité reproposée une seule fois (6 tours)', tours === 6);

console.log('— ce qui compte comme deviné —');
p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
let premier = p.questionCourante().id;
p.repondre(premier);
while (!p.estTerminee()) p.repondre('MAUVAIS');
v('seule la bonne réponse est trouvée', p.entitesTrouvees().join() === premier);
v('les deux autres sont ratées', p.entitesRatees().length === 2);

p = creerPartie({ entites: ENTITES, politique: 'rattrapage' });
p.demarrer();
tours = 0;
while (!p.estTerminee() && tours < 30) {
  const q = p.questionCourante();
  p.repondre(q.estRattrapage ? q.id : 'MAUVAIS');
  tours++;
}
v('un rattrapage ne compte pas comme deviné', p.entitesTrouvees().length === 0);
v('ni comme raté', p.entitesRatees().length === 0);

console.log('— second essai —');
p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
let id = p.questionCourante().id;
p.repondre(id, true);
v('réussite au second essai : pas un premier coup', p.score().premierCoup === 0);
v('réussite au second essai : comptée au rattrapage', p.score().rattrapage === 1);
v('réussite au second essai : pas un raté', p.score().rates === 0);
v('réussite au second essai : hors de la liste des ratés', p.entitesRatees().length === 0);
v('réussite au second essai : pas dans les trouvées du premier coup', p.entitesTrouvees().length === 0);

p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
id = p.questionCourante().id;
v('le drapeau est renvoyé', p.repondre(id, true).secondEssai === true);

p = creerPartie({ entites: ENTITES, politique: 'une-chance' });
p.demarrer();
id = p.questionCourante().id;
p.repondre(id);
v('sans second essai, le premier coup est préservé', p.score().premierCoup === 1);

console.log('— filtres —');
p = creerPartie({ entites: ENTITES, zone: 'Europe' }); p.demarrer();
v('zone Europe = 2 questions', p.questionCourante().total === 2);
p = creerPartie({ entites: ENTITES, longueur: 2 }); p.demarrer();
v('longueur 2', p.questionCourante().total === 2);
p = creerPartie({ entites: ENTITES, longueur: 99 }); p.demarrer();
v('longueur au-delà du disponible = tout', p.questionCourante().total === 3);

console.log('— cas d\'erreur —');
const leve = (fn) => { try { fn(); return false; } catch { return true; } };
v('entités vides rejetées', leve(() => creerPartie({ entites: [] })));
v('zone inexistante rejetée', leve(() => creerPartie({ entites: ENTITES, zone: 'Mars' })));
v('mode inconnu rejeté', leve(() => creerPartie({ entites: ENTITES, mode: 'x' })));
v('mode forme accepté', !leve(() => creerPartie({ entites: ENTITES, mode: 'forme' })));
v('politique inconnue rejetée', leve(() => creerPartie({ entites: ENTITES, politique: 'x' })));

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
