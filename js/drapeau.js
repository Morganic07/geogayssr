const CLASSES_ETAT = { juste: 'est-juste', faux: 'est-faux' };
const TOUTES_CLASSES_ETAT = ['est-juste', 'est-faux'];

export function creerAffichageDrapeau(element, images) {
  function dessiner(entite) {
    const code = entite && entite.drapeau;
    const donnees = code ? images[code] : null;
    if (!donnees) return false;

    element.src = `data:image/webp;base64,${donnees}`;
    element.classList.remove(...TOUTES_CLASSES_ETAT);
    return true;
  }

  function definirEtat(etat) {
    element.classList.remove(...TOUTES_CLASSES_ETAT);
    const classe = CLASSES_ETAT[etat];
    if (classe) element.classList.add(classe);
  }

  function detruire() {
    element.removeAttribute('src');
    element.classList.remove(...TOUTES_CLASSES_ETAT);
  }

  return { dessiner, definirEtat, detruire };
}
