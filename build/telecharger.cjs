const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const CACHE = path.join(__dirname, 'cache');

const JEUX = [
  'ne_10m_admin_0_countries',
  'ne_10m_admin_0_map_units',
  'ne_10m_admin_0_map_subunits',
  'ne_10m_populated_places',
];

function telecharger(nom) {
  const cible = path.join(CACHE, nom + '.geojson');
  if (fs.existsSync(cible) && fs.statSync(cible).size > 0) {
    console.log(`  ${nom} : déjà en cache`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const flux = fs.createWriteStream(cible);
    https.get(`${BASE}/${nom}.geojson`, (rep) => {
      if (rep.statusCode !== 200) {
        flux.close();
        fs.unlinkSync(cible);
        return reject(new Error(`${nom} : HTTP ${rep.statusCode}`));
      }
      rep.pipe(flux);
      flux.on('finish', () => {
        flux.close();
        const mo = (fs.statSync(cible).size / 1048576).toFixed(1);
        console.log(`  ${nom} : téléchargé (${mo} Mo)`);
        resolve();
      });
    }).on('error', (e) => {
      flux.close();
      if (fs.existsSync(cible)) fs.unlinkSync(cible);
      reject(e);
    });
  });
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  console.log('Récupération des données Natural Earth :');
  for (const jeu of JEUX) await telecharger(jeu);
  console.log('Terminé.');
}

main().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
