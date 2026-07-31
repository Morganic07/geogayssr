// Rendu de la carte, zoom/pan par viewBox et détection des clics.

const NS_SVG = 'http://www.w3.org/2000/svg';

const ZOOM_MIN = 1;
const ZOOM_MAX = 40;

// Rayon d'une pastille, exprimé dans les unités du plan à zoom 1 : à l'écran le
// diamètre apparent reste donc de 22 unités quel que soit le recadrage.
const RAYON_PASTILLE = 11;
// Étendue apparente (mêmes unités) au-delà de laquelle une entité se voit toute
// seule : sa pastille commence alors à s'effacer, et disparaît au double.
const SEUIL_VISIBLE = 30;

// Rayon de saisie d'une pastille, en pixels CSS : donne une cible de 44 px de
// diamètre, très au-dessus des quelques pixels du disque réellement dessiné.
const TOLERANCE_TOUCHER = 22;
const DEPLACEMENT_CLIC = 8;
const DUREE_CLIC = 500;

const DUREE_ANIMATION = 400;
const MARGE_CADRAGE = 1.4;
// Cadrage d'une entité sans étendue (Vatican) : sans ce plancher le viewBox
// serait de dimension nulle.
const ETENDUE_MINI = 60;

const CLASSES_ETAT = { interroge: 'est-interroge', juste: 'est-juste', faux: 'est-faux' };
const TOUTES_CLASSES_ETAT = ['est-interroge', 'est-juste', 'est-faux'];

function limiter(valeur, mini, maxi) {
  return valeur < mini ? mini : valeur > maxi ? maxi : valeur;
}

function adoucir(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function creerCarte(elementSvg, donnees) {
  const largeurPlan = donnees.largeur;
  const hauteurPlan = donnees.hauteur;
  const entites = donnees.entites || [];

  const fiches = new Map();
  // Pastilles triées par zoom de disparition croissant : le fondu ne concerne
  // alors qu'une tranche contiguë du tableau à chaque image.
  const pastilles = [];
  const etatsPoses = new Map();

  let groupeContours = null;
  let groupePastilles = null;

  // Rectangle CSS du SVG, mesuré hors de la boucle de rendu.
  const cadre = { gauche: 0, haut: 0, largeur: 1, hauteur: 1 };
  // Emprise correspondant au zoom 1, plan étiré au ratio du viewport pour que
  // le viewBox remplisse exactement l'élément (conversion écran/plan exacte).
  const base = { x: 0, y: 0, l: largeurPlan, h: hauteurPlan };
  const vue = { x: 0, y: 0, l: largeurPlan, h: hauteurPlan };

  let zoomApplique = -1;
  let bandeDebut = 0;
  let bandeFin = 0;

  let imageMaj = 0;
  let imageAnim = 0;
  // Vrai tant que le rectangle CSS a déjà été relu dans l'image courante.
  let mesureAJour = false;
  let rappelClic = null;
  let detruit = false;

  const pointeurs = new Map();
  let pincement = null;
  let gesteMultiple = false;
  let candidatClic = null;
  let observateur = null;

  // --- Mesure et bornes ----------------------------------------------------

  function recalculerBase() {
    const centreX = vue.x + vue.l / 2;
    const centreY = vue.y + vue.h / 2;
    const zoomCourant = vue.l > 0 ? base.l / vue.l : 1;

    const ratioVue = cadre.largeur / cadre.hauteur;
    let l = largeurPlan;
    let h = hauteurPlan;
    if (ratioVue > largeurPlan / hauteurPlan) l = hauteurPlan * ratioVue;
    else h = largeurPlan / ratioVue;

    base.l = l;
    base.h = h;
    base.x = (largeurPlan - l) / 2;
    base.y = (hauteurPlan - h) / 2;

    vue.l = limiter(base.l / zoomCourant, base.l / ZOOM_MAX, base.l);
    vue.h = vue.l * base.h / base.l;
    vue.x = centreX - vue.l / 2;
    vue.y = centreY - vue.h / 2;
    borner(vue);

    zoomApplique = -1;
    planifierMaj();
  }

  function mesurer() {
    mesureAJour = true;
    const r = elementSvg.getBoundingClientRect();
    cadre.gauche = r.left;
    cadre.haut = r.top;
    const l = r.width || 1;
    const h = r.height || 1;
    if (l !== cadre.largeur || h !== cadre.hauteur) {
      cadre.largeur = l;
      cadre.hauteur = h;
      recalculerBase();
    }
  }

  // La vue ne sort jamais du plan ; si elle est plus grande que lui sur un axe
  // (bande de letterbox), elle s'y centre.
  function borner(v) {
    if (v.l >= largeurPlan) v.x = (largeurPlan - v.l) / 2;
    else v.x = limiter(v.x, 0, largeurPlan - v.l);
    if (v.h >= hauteurPlan) v.y = (hauteurPlan - v.h) / 2;
    else v.y = limiter(v.y, 0, hauteurPlan - v.h);
  }

  function versPlan(clientX, clientY) {
    return {
      x: vue.x + (clientX - cadre.gauche) / cadre.largeur * vue.l,
      y: vue.y + (clientY - cadre.haut) / cadre.hauteur * vue.h
    };
  }

  // --- Application de la vue ----------------------------------------------

  function planifierMaj() {
    if (imageMaj || detruit) return;
    imageMaj = requestAnimationFrame(() => {
      imageMaj = 0;
      appliquerVue();
    });
  }

  function appliquerVue() {
    mesureAJour = false;
    elementSvg.setAttribute('viewBox', vue.x + ' ' + vue.y + ' ' + vue.l + ' ' + vue.h);
    const zoom = base.l / vue.l;
    // Le glissement ne change pas le zoom : les pastilles sont alors intactes.
    if (zoom !== zoomApplique) {
      zoomApplique = zoom;
      majPastilles(zoom);
    }
  }

  function indiceParZoom(seuil, strict) {
    let bas = 0;
    let haut = pastilles.length;
    while (bas < haut) {
      const milieu = (bas + haut) >> 1;
      const z = pastilles[milieu].zoomDisparition;
      if (strict ? z > seuil : z >= seuil) haut = milieu;
      else bas = milieu + 1;
    }
    return bas;
  }

  function poserOpacite(fiche, opacite) {
    const o = limiter(opacite, 0, 1);
    if (o !== fiche.opacite) {
      fiche.opacite = o;
      fiche.pastille.style.opacity = o === 1 ? '' : String(o);
    }
    const visible = fiche.actif && o > 0;
    if (visible !== fiche.visible) {
      fiche.visible = visible;
      fiche.pastille.style.display = visible ? '' : 'none';
    }
  }

  function majPastilles(zoom) {
    const rayon = RAYON_PASTILLE / zoom;
    const debut = indiceParZoom(zoom / 2, false);
    const fin = indiceParZoom(zoom, true);

    // Sorties de bande depuis l'image précédente : états terminaux.
    for (let i = Math.min(debut, bandeDebut); i < debut; i++) poserOpacite(pastilles[i], 0);
    for (let i = fin; i < Math.max(fin, bandeFin); i++) poserOpacite(pastilles[i], 1);
    for (let i = debut; i < fin; i++) {
      const f = pastilles[i];
      poserOpacite(f, (2 * f.zoomDisparition - zoom) / f.zoomDisparition);
    }
    bandeDebut = debut;
    bandeFin = fin;

    // Les pastilles totalement effacées n'ont pas besoin d'un rayon à jour.
    for (let i = debut; i < pastilles.length; i++) {
      pastilles[i].pastille.setAttribute('r', rayon);
    }
  }

  function arreterAnimation() {
    if (imageAnim) {
      cancelAnimationFrame(imageAnim);
      imageAnim = 0;
    }
  }

  function animerVers(cible) {
    arreterAnimation();
    const depart = { x: vue.x, y: vue.y, l: vue.l, h: vue.h };
    const cxDepart = depart.x + depart.l / 2;
    const cyDepart = depart.y + depart.h / 2;
    const cxCible = cible.x + cible.l / 2;
    const cyCible = cible.y + cible.h / 2;
    const rapport = cible.l / depart.l;
    const debut = performance.now();

    const pas = (maintenant) => {
      const p = limiter((maintenant - debut) / DUREE_ANIMATION, 0, 1);
      const e = adoucir(p);
      // Interpolation géométrique de l'échelle : un zoom linéaire paraîtrait
      // brutal au début et interminable à la fin.
      vue.l = depart.l * Math.pow(rapport, e);
      vue.h = vue.l * base.h / base.l;
      vue.x = cxDepart + (cxCible - cxDepart) * e - vue.l / 2;
      vue.y = cyDepart + (cyCible - cyDepart) * e - vue.h / 2;
      borner(vue);
      appliquerVue();
      imageAnim = p < 1 ? requestAnimationFrame(pas) : 0;
    };
    imageAnim = requestAnimationFrame(pas);
  }

  function cadrerSur(x0, y0, x1, y1, anime) {
    const ratio = base.l / base.h;
    let l = Math.max((x1 - x0) * MARGE_CADRAGE, ETENDUE_MINI);
    let h = Math.max((y1 - y0) * MARGE_CADRAGE, ETENDUE_MINI / ratio);
    if (l / h < ratio) l = h * ratio;
    else h = l / ratio;
    l = limiter(l, base.l / ZOOM_MAX, base.l);
    h = l / ratio;

    const cible = { x: (x0 + x1) / 2 - l / 2, y: (y0 + y1) / 2 - h / 2, l: l, h: h };
    borner(cible);
    if (anime) {
      animerVers(cible);
    } else {
      arreterAnimation();
      vue.x = cible.x; vue.y = cible.y; vue.l = cible.l; vue.h = cible.h;
      planifierMaj();
    }
  }

  // --- Construction du DOM -------------------------------------------------

  function dessiner() {
    if (groupeContours) groupeContours.remove();
    if (groupePastilles) groupePastilles.remove();
    fiches.clear();
    pastilles.length = 0;
    etatsPoses.clear();
    bandeDebut = 0;
    bandeFin = 0;

    elementSvg.setAttribute('viewBox', '0 0 ' + largeurPlan + ' ' + hauteurPlan);
    elementSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Sans cela le navigateur préempte les gestes et le pincement n'arrive jamais.
    elementSvg.style.touchAction = 'none';
    elementSvg.style.userSelect = 'none';
    elementSvg.style.webkitUserSelect = 'none';

    groupeContours = document.createElementNS(NS_SVG, 'g');
    groupeContours.setAttribute('class', 'carte-contours');
    groupePastilles = document.createElementNS(NS_SVG, 'g');
    groupePastilles.setAttribute('class', 'carte-pastilles');
    // Le pointage des pastilles se fait par proximité en JS, pas par le DOM :
    // une pastille effacée ne doit jamais intercepter le doigt.
    groupePastilles.style.pointerEvents = 'none';

    for (const entite of entites) {
      const zone = entite.zone || [0, 0, 0, 0];
      const fiche = {
        entite: entite,
        chemin: null,
        pastille: null,
        actif: true,
        visible: true,
        opacite: 1,
        cx: (zone[0] + zone[2]) / 2,
        cy: (zone[1] + zone[3]) / 2,
        zoomDisparition: Infinity
      };

      if (entite.d) {
        const chemin = document.createElementNS(NS_SVG, 'path');
        chemin.setAttribute('class', 'pays');
        chemin.setAttribute('d', entite.d);
        chemin.setAttribute('data-id', entite.id);
        fiche.chemin = chemin;
        groupeContours.appendChild(chemin);
      }

      if (entite.pastille) {
        const cercle = document.createElementNS(NS_SVG, 'circle');
        cercle.setAttribute('class', 'pastille');
        cercle.setAttribute('cx', fiche.cx);
        cercle.setAttribute('cy', fiche.cy);
        cercle.setAttribute('r', RAYON_PASTILLE);
        cercle.setAttribute('data-id', entite.id);
        fiche.pastille = cercle;
        groupePastilles.appendChild(cercle);

        const etendue = Math.max(zone[2] - zone[0], zone[3] - zone[1]);
        // Une entité au tracé vide n'existe que par sa pastille : elle ne
        // s'efface jamais, quel que soit le zoom.
        if (entite.d && etendue > 0) fiche.zoomDisparition = SEUIL_VISIBLE / etendue;
        pastilles.push(fiche);
      }

      fiches.set(entite.id, fiche);
    }

    // Comparateur explicite : une soustraction donnerait NaN entre deux
    // entités de zoom de disparition infini, et l'ordre deviendrait douteux.
    pastilles.sort((a, b) => {
      if (a.zoomDisparition === b.zoomDisparition) return 0;
      return a.zoomDisparition < b.zoomDisparition ? -1 : 1;
    });

    const fragment = document.createDocumentFragment();
    fragment.appendChild(groupeContours);
    fragment.appendChild(groupePastilles);
    elementSvg.appendChild(fragment);

    mesurer();
    // Le redessin repart du monde entier : sans cette remise à plat, le cadrage
    // de la partie précédente survivrait, et le viewBox posé plus haut serait
    // aussitôt remplacé par une vue périmée.
    arreterAnimation();
    vue.x = base.x;
    vue.y = base.y;
    vue.l = base.l;
    vue.h = base.h;
    zoomApplique = -1;
    // Application immédiate plutôt que différée : une image au mauvais cadrage
    // suffit à faire clignoter la carte à chaque nouvelle partie.
    appliquerVue();
  }

  // --- États ---------------------------------------------------------------

  function appliquerClasse(fiche, classe) {
    for (const el of [fiche.chemin, fiche.pastille]) {
      if (!el) continue;
      el.classList.remove(...TOUTES_CLASSES_ETAT);
      if (classe) el.classList.add(classe);
    }
  }

  function definirEtat(id, etat) {
    const fiche = fiches.get(id);
    if (!fiche) return;
    const classe = CLASSES_ETAT[etat] || null;
    appliquerClasse(fiche, classe);
    if (classe) etatsPoses.set(id, classe);
    else etatsPoses.delete(id);
  }

  function reinitialiserEtats() {
    for (const id of etatsPoses.keys()) {
      const fiche = fiches.get(id);
      if (fiche) appliquerClasse(fiche, null);
    }
    etatsPoses.clear();
  }

  // --- Filtrage ------------------------------------------------------------

  function poserActivite(fiche, actif) {
    fiche.actif = actif;
    if (fiche.chemin) fiche.chemin.style.display = actif ? '' : 'none';
    if (fiche.pastille) {
      const visible = actif && fiche.opacite > 0;
      if (visible !== fiche.visible) {
        fiche.visible = visible;
        fiche.pastille.style.display = visible ? '' : 'none';
      }
    }
  }

  function filtrerContinent(nom) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const fiche of fiches.values()) {
      const actif = nom === null || nom === undefined || fiche.entite.continent === nom;
      poserActivite(fiche, actif);
      if (!actif) continue;
      const z = fiche.entite.zone;
      if (!z) continue;
      if (z[0] < x0) x0 = z[0];
      if (z[1] < y0) y0 = z[1];
      if (z[2] > x1) x1 = z[2];
      if (z[3] > y1) y1 = z[3];
    }
    if (nom === null || nom === undefined || x0 > x1) reinitialiserVue();
    else cadrerSur(x0, y0, x1, y1, true);
  }

  // --- Vue publique --------------------------------------------------------

  function zoomerSur(id) {
    const fiche = fiches.get(id);
    if (!fiche) return;
    const z = fiche.entite.zone || [fiche.cx, fiche.cy, fiche.cx, fiche.cy];
    cadrerSur(z[0], z[1], z[2], z[3], true);
  }

  function reinitialiserVue() {
    animerVers({ x: base.x, y: base.y, l: base.l, h: base.h });
  }

  // --- Gestes --------------------------------------------------------------

  function zoomerAutourDe(clientX, clientY, facteur) {
    const point = versPlan(clientX, clientY);
    const l = limiter(vue.l / facteur, base.l / ZOOM_MAX, base.l);
    vue.l = l;
    vue.h = l * base.h / base.l;
    vue.x = point.x - (clientX - cadre.gauche) / cadre.largeur * vue.l;
    vue.y = point.y - (clientY - cadre.haut) / cadre.hauteur * vue.h;
    borner(vue);
    planifierMaj();
  }

  function surMolette(ev) {
    ev.preventDefault();
    arreterAnimation();
    // Un pavé tactile émet des dizaines d'événements par image : relire le
    // rectangle CSS à chacun forcerait autant de calculs de mise en page.
    if (!mesureAJour) mesurer();
    let delta = ev.deltaY;
    if (ev.deltaMode === 1) delta *= 16;
    else if (ev.deltaMode === 2) delta *= cadre.hauteur;
    zoomerAutourDe(ev.clientX, ev.clientY, Math.exp(-limiter(delta, -400, 400) * 0.002));
  }

  function demarrerPincement() {
    const deux = [...pointeurs.values()].slice(0, 2);
    const milieuX = (deux[0].x + deux[1].x) / 2;
    const milieuY = (deux[0].y + deux[1].y) / 2;
    const ecart = Math.max(Math.hypot(deux[0].x - deux[1].x, deux[0].y - deux[1].y), 1);
    pincement = {
      ids: [deux[0].id, deux[1].id],
      ancre: versPlan(milieuX, milieuY),
      // Écart entre les doigts converti en unités du plan : l'échelle courante
      // s'en déduit à chaque image, et les points ancrés restent sous les doigts.
      ecartPlan: ecart / (cadre.largeur / vue.l)
    };
  }

  function suivrePincement() {
    const a = pointeurs.get(pincement.ids[0]);
    const b = pointeurs.get(pincement.ids[1]);
    if (!a || !b) return;
    const ecart = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
    const echelle = ecart / pincement.ecartPlan;
    const l = limiter(cadre.largeur / echelle, base.l / ZOOM_MAX, base.l);
    vue.l = l;
    vue.h = l * base.h / base.l;
    const milieuX = (a.x + b.x) / 2;
    const milieuY = (a.y + b.y) / 2;
    vue.x = pincement.ancre.x - (milieuX - cadre.gauche) / cadre.largeur * vue.l;
    vue.y = pincement.ancre.y - (milieuY - cadre.haut) / cadre.hauteur * vue.h;
    borner(vue);
    planifierMaj();
  }

  function surPointeurBas(ev) {
    arreterAnimation();
    if (pointeurs.size === 0) {
      mesurer();
      gesteMultiple = false;
    }
    try {
      elementSvg.setPointerCapture(ev.pointerId);
    } catch (e) {
      // Pointeur déjà relâché : rien à capturer.
    }
    pointeurs.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY });

    if (pointeurs.size === 1) {
      // Bouton secondaire ou molette enfoncée : la souris peut encore faire
      // glisser la carte, mais elle ne doit pas répondre à la question.
      candidatClic = ev.button !== 0 ? null : {
        id: ev.pointerId,
        x: ev.clientX,
        y: ev.clientY,
        temps: performance.now(),
        cible: ev.target
      };
    } else {
      // Un pincement, même avorté, ne doit jamais produire de clic.
      candidatClic = null;
      gesteMultiple = true;
      demarrerPincement();
    }
  }

  function surPointeurBouge(ev) {
    const p = pointeurs.get(ev.pointerId);
    if (!p) return;
    const precedentX = p.x;
    const precedentY = p.y;
    p.x = ev.clientX;
    p.y = ev.clientY;

    if (candidatClic && candidatClic.id === ev.pointerId) {
      if (Math.hypot(ev.clientX - candidatClic.x, ev.clientY - candidatClic.y) > DEPLACEMENT_CLIC) {
        candidatClic = null;
      }
    }

    if (pincement) {
      suivrePincement();
    } else if (pointeurs.size === 1) {
      vue.x -= (ev.clientX - precedentX) / cadre.largeur * vue.l;
      vue.y -= (ev.clientY - precedentY) / cadre.hauteur * vue.h;
      borner(vue);
      planifierMaj();
    }
  }

  function trouverPastille(clientX, clientY) {
    const point = versPlan(clientX, clientY);
    const tolerance = TOLERANCE_TOUCHER / (cadre.largeur / vue.l);
    const seuil = tolerance * tolerance;
    let meilleure = null;
    let meilleureDistance = Infinity;
    for (const fiche of pastilles) {
      if (!fiche.visible) continue;
      const dx = fiche.cx - point.x;
      const dy = fiche.cy - point.y;
      const d = dx * dx + dy * dy;
      if (d <= seuil && d < meilleureDistance) {
        meilleureDistance = d;
        meilleure = fiche;
      }
    }
    return meilleure;
  }

  function resoudreClic(clientX, clientY, cible) {
    // Les pastilles priment : c'est toute leur raison d'être.
    const pastille = trouverPastille(clientX, clientY);
    if (pastille) return pastille.entite.id;
    const el = cible && cible.closest ? cible.closest('[data-id]') : null;
    if (!el) return null;
    const fiche = fiches.get(el.getAttribute('data-id'));
    return fiche && fiche.actif ? fiche.entite.id : null;
  }

  function surPointeurHaut(ev) {
    if (!pointeurs.has(ev.pointerId)) return;
    pointeurs.delete(ev.pointerId);
    try {
      elementSvg.releasePointerCapture(ev.pointerId);
    } catch (e) {
      // Capture déjà perdue.
    }

    if (pincement && (!pointeurs.has(pincement.ids[0]) || !pointeurs.has(pincement.ids[1]))) {
      pincement = null;
    }
    // Un doigt levé parmi trois abandonnait le pincement sans rien remettre à
    // sa place : la carte restait figée, trop de pointeurs pour glisser et plus
    // de pincement pour zoomer.
    if (!pincement && pointeurs.size >= 2) demarrerPincement();

    const candidat = candidatClic;
    if (candidat && candidat.id === ev.pointerId) {
      candidatClic = null;
      const bref = performance.now() - candidat.temps < DUREE_CLIC;
      if (bref && !gesteMultiple && ev.type === 'pointerup' && rappelClic) {
        // Position du relâchement, pas celle de l'appui : un tremblement sous le
        // seuil de clic a déjà fait glisser la carte d'autant, et le point du
        // plan visé n'est plus celui d'origine.
        const id = resoudreClic(ev.clientX, ev.clientY, candidat.cible);
        if (id) rappelClic(id);
      }
    }

    if (pointeurs.size === 0) {
      pincement = null;
      gesteMultiple = false;
    }
  }

  function surRedimensionnement() {
    mesurer();
  }

  elementSvg.addEventListener('pointerdown', surPointeurBas);
  elementSvg.addEventListener('pointermove', surPointeurBouge);
  elementSvg.addEventListener('pointerup', surPointeurHaut);
  elementSvg.addEventListener('pointercancel', surPointeurHaut);
  elementSvg.addEventListener('wheel', surMolette, { passive: false });

  if (typeof ResizeObserver === 'function') {
    observateur = new ResizeObserver(surRedimensionnement);
    observateur.observe(elementSvg);
  }
  window.addEventListener('resize', surRedimensionnement);

  function detruire() {
    detruit = true;
    elementSvg.removeEventListener('pointerdown', surPointeurBas);
    elementSvg.removeEventListener('pointermove', surPointeurBouge);
    elementSvg.removeEventListener('pointerup', surPointeurHaut);
    elementSvg.removeEventListener('pointercancel', surPointeurHaut);
    elementSvg.removeEventListener('wheel', surMolette);
    window.removeEventListener('resize', surRedimensionnement);
    if (observateur) {
      observateur.disconnect();
      observateur = null;
    }
    arreterAnimation();
    if (imageMaj) {
      cancelAnimationFrame(imageMaj);
      imageMaj = 0;
    }
    if (groupeContours) groupeContours.remove();
    if (groupePastilles) groupePastilles.remove();
    groupeContours = null;
    groupePastilles = null;
    fiches.clear();
    pastilles.length = 0;
    etatsPoses.clear();
    pointeurs.clear();
    pincement = null;
    candidatClic = null;
    rappelClic = null;
  }

  return {
    dessiner: dessiner,
    definirEtat: definirEtat,
    reinitialiserEtats: reinitialiserEtats,
    zoomerSur: zoomerSur,
    reinitialiserVue: reinitialiserVue,
    filtrerContinent: filtrerContinent,
    surClicEntite: function (rappel) { rappelClic = rappel; },
    detruire: detruire
  };
}
