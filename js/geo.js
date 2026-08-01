const RAYON_TERRE = 6371;
const DEG = Math.PI / 180;

const DIRECTIONS = [
  'au nord', 'au nord-est', 'à l\'est', 'au sud-est',
  'au sud', 'au sud-ouest', 'à l\'ouest', 'au nord-ouest',
];

export function distanceKm(depuis, vers) {
  if (!estUnPoint(depuis) || !estUnPoint(vers)) return null;

  const lat1 = depuis[1] * DEG;
  const lat2 = vers[1] * DEG;
  const dLat = lat2 - lat1;
  const dLon = (vers[0] - depuis[0]) * DEG;

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function direction(depuis, vers) {
  if (!estUnPoint(depuis) || !estUnPoint(vers)) return null;

  const lat1 = depuis[1] * DEG;
  const lat2 = vers[1] * DEG;
  const dLon = (vers[0] - depuis[0]) * DEG;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const cap = (Math.atan2(y, x) / DEG + 360) % 360;
  return DIRECTIONS[Math.round(cap / 45) % 8];
}

export function formaterDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  const arrondi = km < 100 ? Math.round(km)
    : km < 1000 ? Math.round(km / 10) * 10
      : Math.round(km / 100) * 100;
  return `${arrondi.toLocaleString('fr-FR')} km`;
}

export function indiceEcart(depuis, vers) {
  const km = distanceKm(depuis, vers);
  if (km == null) return null;
  if (km < 1) return 'au même endroit';
  const cap = direction(depuis, vers);
  return `${formaterDistance(km)} ${cap}`;
}

function estUnPoint(p) {
  return Array.isArray(p) && p.length === 2
    && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}
