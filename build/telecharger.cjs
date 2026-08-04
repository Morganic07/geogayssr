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

const CODES_DRAPEAUX = 'https://flagcdn.com/fr/codes.json';
const CIBLE_CODES = path.join(CACHE, 'drapeaux-codes.json');

function recuperer(url, cible, nom) {
  if (fs.existsSync(cible) && fs.statSync(cible).size > 0) {
    console.log(`  ${nom} : déjà en cache`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const flux = fs.createWriteStream(cible);
    https.get(url, (rep) => {
      if (rep.statusCode !== 200) {
        flux.close();
        fs.unlinkSync(cible);
        return reject(new Error(`${nom} : HTTP ${rep.statusCode}`));
      }
      rep.pipe(flux);
      flux.on('finish', () => {
        flux.close();
        const octets = fs.statSync(cible).size;
        const taille = octets >= 1048576
          ? `${(octets / 1048576).toFixed(1)} Mo`
          : `${(octets / 1024).toFixed(0)} Ko`;
        console.log(`  ${nom} : téléchargé (${taille})`);
        resolve();
      });
    }).on('error', (e) => {
      flux.close();
      if (fs.existsSync(cible)) fs.unlinkSync(cible);
      reject(e);
    });
  });
}

function telecharger(nom) {
  return recuperer(`${BASE}/${nom}.geojson`, path.join(CACHE, nom + '.geojson'), nom);
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  console.log('Récupération des données Natural Earth :');
  for (const jeu of JEUX) await telecharger(jeu);
  console.log('Liste des drapeaux disponibles :');
  await recuperer(CODES_DRAPEAUX, CIBLE_CODES, 'drapeaux-codes');
  console.log('Terminé.');
}

main().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
