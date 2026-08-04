const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'cache', 'drapeaux');
const SORTIE = path.join(RACINE, 'data');
const CIBLE = path.join(SORTIE, 'drapeaux.json');

const CARTES = ['onu', 'units', 'subunits'];
const SOURCE = 'https://flagcdn.com/w320';
const FRONT = 8;

// Sans perte : un drapeau est fait d'aplats, que la compression avec perte
// double de volume en y semant du bruit. Mesuré sur l'ensemble des drapeaux.
const CWEBP = ['-lossless', '-z', '9', '-quiet'];

function verifierCwebp() {
  try {
    execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  } catch (e) {
    console.error('\ncwebp est introuvable : installe-le (paquet « webp ») pour fabriquer les drapeaux');
    process.exit(1);
  }
}

function codesUtilises() {
  const codes = new Set();
  for (const carte of CARTES) {
    const chemin = path.join(SORTIE, `carte-${carte}.json`);
    if (!fs.existsSync(chemin)) {
      console.error(`\ncarte-${carte}.json absent : lance « node build/generer.cjs » avant`);
      process.exit(1);
    }
    const { entites } = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    for (const e of entites) if (e.drapeau) codes.add(e.drapeau);
  }
  return codes;
}

function telecharger(code) {
  const cible = path.join(CACHE, `${code}.png`);
  if (fs.existsSync(cible) && fs.statSync(cible).size > 0) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    https.get(`${SOURCE}/${code}.png`, (rep) => {
      if (rep.statusCode !== 200) {
        rep.resume();
        return reject(new Error(`${code} : HTTP ${rep.statusCode}`));
      }
      const morceaux = [];
      rep.on('data', (m) => morceaux.push(m));
      rep.on('end', () => {
        const contenu = Buffer.concat(morceaux);
        if (contenu.length === 0) return reject(new Error(`${code} : image vide`));
        fs.writeFileSync(cible, contenu);
        resolve(true);
      });
    }).on('error', (e) => reject(new Error(`${code} : ${e.message}`)));
  });
}

async function parLots(codes) {
  let telecharges = 0;
  for (let i = 0; i < codes.length; i += FRONT) {
    const lot = codes.slice(i, i + FRONT);
    const faits = await Promise.all(lot.map(telecharger));
    telecharges += faits.filter(Boolean).length;
  }
  return telecharges;
}

// Le WebP en cache n'est refait que si le PNG a bougé : changer les options de
// CWEBP demande donc de vider build/cache/drapeaux/.
function convertir(code) {
  const png = path.join(CACHE, `${code}.png`);
  const webp = path.join(CACHE, `${code}.webp`);
  if (!fs.existsSync(webp) || fs.statSync(webp).mtimeMs < fs.statSync(png).mtimeMs) {
    execFileSync('cwebp', [...CWEBP, png, '-o', webp]);
  }
  return fs.readFileSync(webp);
}

async function main() {
  verifierCwebp();
  fs.mkdirSync(CACHE, { recursive: true });

  const codes = [...codesUtilises()].sort();
  if (codes.length === 0) {
    console.error('\nAucune entité ne porte de drapeau : regénère les cartes');
    process.exit(1);
  }

  const telecharges = await parLots(codes);

  const drapeaux = {};
  let brut = 0;
  for (const code of codes) {
    const webp = convertir(code);
    brut += webp.length;
    drapeaux[code] = webp.toString('base64');
  }

  fs.writeFileSync(CIBLE, JSON.stringify({ version: 1, format: 'image/webp', drapeaux }));
  const ko = (v) => (v / 1024).toFixed(0);

  console.log('drapeaux :');
  console.log(`  codes          ${codes.length} (${telecharges} téléchargé(s), le reste en cache)`);
  console.log(`  images         ${ko(brut)} Ko en WebP sans perte`);
  console.log(`  fichier        ${ko(fs.statSync(CIBLE).size)} Ko une fois encodé en base64`);
}

main().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
