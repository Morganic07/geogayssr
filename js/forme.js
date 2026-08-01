const NS_SVG = 'http://www.w3.org/2000/svg';

const MARGE = 0.08;
const CLASSES_ETAT = { juste: 'est-juste', faux: 'est-faux' };
const TOUTES_CLASSES_ETAT = ['est-juste', 'est-faux'];

export function creerSilhouette(elementSvg) {
  let chemin = null;

  function assurerChemin() {
    if (chemin) return chemin;
    chemin = document.createElementNS(NS_SVG, 'path');
    chemin.setAttribute('class', 'silhouette');
    elementSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    elementSvg.appendChild(chemin);
    return chemin;
  }

  function dessiner(entite) {
    if (!entite || !entite.forme || !entite.d) return false;

    const [x0, y0, x1, y1] = entite.forme;
    const largeur = Math.max(x1 - x0, 1);
    const hauteur = Math.max(y1 - y0, 1);
    const marge = Math.max(largeur, hauteur) * MARGE;

    elementSvg.setAttribute('viewBox', [
      x0 - marge, y0 - marge, largeur + 2 * marge, hauteur + 2 * marge,
    ].join(' '));

    const el = assurerChemin();
    el.setAttribute('d', entite.d);
    el.classList.remove(...TOUTES_CLASSES_ETAT);
    return true;
  }

  function definirEtat(etat) {
    if (!chemin) return;
    chemin.classList.remove(...TOUTES_CLASSES_ETAT);
    const classe = CLASSES_ETAT[etat];
    if (classe) chemin.classList.add(classe);
  }

  function detruire() {
    if (chemin) chemin.remove();
    chemin = null;
    elementSvg.removeAttribute('viewBox');
  }

  return { dessiner, definirEtat, detruire };
}
