const $ = (sel) => document.querySelector(sel);

function afficherProposition(enregistrement) {
  const bloc = $('#maj-disponible');
  if (!bloc) return;
  bloc.hidden = false;

  $('#bouton-maj').addEventListener('click', () => {
    const attente = enregistrement.waiting;
    if (!attente) {
      location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    attente.postMessage('appliquer-maintenant');
  }, { once: true });
}

function surveiller(enregistrement) {
  if (enregistrement.waiting && navigator.serviceWorker.controller) {
    afficherProposition(enregistrement);
  }

  enregistrement.addEventListener('updatefound', () => {
    const arrivant = enregistrement.installing;
    if (!arrivant) return;
    arrivant.addEventListener('statechange', () => {
      if (arrivant.state === 'installed' && navigator.serviceWorker.controller) {
        afficherProposition(enregistrement);
      }
    });
  });
}

export function activerHorsLigne() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(surveiller)
      .catch((e) => {
        console.warn('Jeu hors ligne indisponible :', e.message);
      });
  });
}
