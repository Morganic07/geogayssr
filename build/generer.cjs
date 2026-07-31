const fs = require('fs');
const path = require('path');
const d3 = require('d3-geo');
const { topology } = require('topojson-server');
const { presimplify, simplify } = require('topojson-simplify');
const { feature } = require('topojson-client');

const CACHE = path.join(__dirname, 'cache');
const SORTIE = path.join(__dirname, '..', 'data');

const LARGEUR = 2000;
const DECIMALES = 1;
const SEUIL_PASTILLE = 12;
const SEUIL_SIMPLIF = 0.005;

const EXCLUES = new Set([
  'KNX', 'KNZ',
]);

const MEMBRES_ONU = `
AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN
BOL BIH BWA BRA BRN BGR BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD
CRI CIV HRV CUB CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH FJI FIN
FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ
IRL ISR ITA JAM JPN JOR KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE
LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR MOZ MMR
NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT
QAT ROU RUS RWA KNA LCA VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM
ZAF SSD ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO TUN TUR TKM TUV
UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE
`.trim().split(/\s+/);

const AUTRES_ONU = ['VAT', 'PSE', 'COK', 'NIU'];
const PERIMETRE_ONU = new Set([...MEMBRES_ONU, ...AUTRES_ONU]);

const CORRECTIONS = {
  FSA: { fr: 'Terres australes françaises', en: 'French Southern Territories' },
  PGA: { fr: 'Îles Spratly', en: 'Spratly Islands' },
  WQI: { fr: 'Île Wake', en: 'Wake Island' },
  SOP: { fr: 'Puntland', en: 'Puntland' },
  MAF: { fr: 'Saint-Martin (France)', en: 'Saint Martin' },
  SXM: { fr: 'Saint-Martin (Pays-Bas)', en: 'Sint Maarten' },
  RUA: { fr: 'Russie (Asie)', en: 'Russia (Asia)' },
  RUE: { fr: 'Russie (Europe)', en: 'Russia (Europe)' },
  KXI: { fr: 'Corée du Sud (îles)', en: 'South Korea (islands)' },
};

const JEUX = [
  { nom: 'onu', fichier: 'ne_10m_admin_0_countries', attendu: 197, filtreOnu: true },
  { nom: 'units', fichier: 'ne_10m_admin_0_map_units', attendu: 298 },
  { nom: 'subunits', fichier: 'ne_10m_admin_0_map_subunits', attendu: 360 },
];

function codesPossibles(p) {
  return [p.ADM0_A3, p.ISO_A3_EH, p.ISO_A3, p.SU_A3].filter((c) => c && c !== '-99');
}

function continentJouable(p) {
  if (p.CONTINENT && p.CONTINENT !== 'Seven seas (open ocean)') return p.CONTINENT;
  if (p.REGION_UN === 'Americas') {
    return p.SUBREGION === 'South America' ? 'South America' : 'North America';
  }
  return p.REGION_UN && p.REGION_UN !== 'Seven seas (open ocean)' ? p.REGION_UN : 'Océans';
}

function dedupliquerParCodeOnu(features, aireDe) {
  const meilleure = new Map();
  for (const f of features) {
    const code = codesPossibles(f.properties).find((c) => PERIMETRE_ONU.has(c));
    if (!code) continue;
    const aire = aireDe(f);
    const actuelle = meilleure.get(code);
    if (!actuelle || aire > actuelle.aire) meilleure.set(code, { f, aire });
  }
  return [...meilleure.values()].map((x) => x.f);
}

function contexteArrondi(decimales) {
  const f = Math.pow(10, decimales);
  const r = (v) => Math.round(v * f) / f;
  let morceaux = [];
  let dernier = null;
  let pointsDepuisMove = 0;
  let debutMorceau = 0;

  return {
    moveTo(x, y) {
      debutMorceau = morceaux.length;
      pointsDepuisMove = 0;
      dernier = [r(x), r(y)];
      morceaux.push(`M${dernier[0]},${dernier[1]}`);
    },
    lineTo(x, y) {
      const p = [r(x), r(y)];
      if (dernier && p[0] === dernier[0] && p[1] === dernier[1]) return;
      dernier = p;
      pointsDepuisMove++;
      morceaux.push(`L${p[0]},${p[1]}`);
    },
    closePath() {
      if (pointsDepuisMove < 2) morceaux.length = debutMorceau;
      else morceaux.push('Z');
      dernier = null;
    },
    arc() {},
    recupererEtVider() {
      const s = morceaux.join('');
      morceaux = [];
      dernier = null;
      return s;
    },
  };
}

function polygones(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'Polygon') return [geometrie];
  if (geometrie.type === 'MultiPolygon') {
    return geometrie.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
  }
  return [];
}

function estFini(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function traiter(jeu) {
  const brut = JSON.parse(
    fs.readFileSync(path.join(CACHE, jeu.fichier + '.geojson'), 'utf8')
  );

  let retenues = brut.features.filter((f) => {
    if (EXCLUES.has(f.properties.SU_A3)) return false;
    if (jeu.filtreOnu) return codesPossibles(f.properties).some((c) => PERIMETRE_ONU.has(c));
    return true;
  });
  if (jeu.filtreOnu) {
    const aire = d3.geoPath(d3.geoNaturalEarth1());
    retenues = dedupliquerParCodeOnu(retenues, (f) => Math.abs(aire.area(f)));
  }
  const exclues = brut.features.length - retenues.length;

  const original = new Map(retenues.map((f) => [f.properties.SU_A3, f]));

  const topo = simplify(
    presimplify(topology({ pays: { type: 'FeatureCollection', features: retenues } })),
    SEUIL_SIMPLIF
  );
  const simplifiees = feature(topo, topo.objects.pays).features;

  const projection = d3.geoNaturalEarth1();
  projection.fitWidth(LARGEUR, { type: 'FeatureCollection', features: retenues });

  const contexte = contexteArrondi(DECIMALES);
  const chemin = d3.geoPath(projection, contexte);
  const mesure = d3.geoPath(projection);

  const entites = [];
  const anomalies = [];
  let minuscules = 0;
  let basDuPlan = 0;

  for (const f of simplifiees) {
    const p = f.properties;
    chemin(f);
    const d = contexte.recupererEtVider();

    const source = original.get(p.SU_A3) || f;

    let meilleur = null;
    for (const poly of polygones(source.geometry)) {
      const aire = Math.abs(mesure.area(poly));
      if (!meilleur || aire > meilleur.aire) meilleur = { aire, poly };
    }
    const bornes = mesure.bounds(meilleur ? meilleur.poly : source);
    const aireTotale = Math.abs(mesure.area(source));

    if (!bornes.flat().every(estFini)) {
      anomalies.push(`${p.SU_A3} (${p.NAME_FR}) : cadrage invalide, entité écartée`);
      continue;
    }
    if (!d) minuscules++;

    if (d) {
      const completes = mesure.bounds(f);
      if (completes.flat().every(estFini) && completes[1][1] > basDuPlan) {
        basDuPlan = completes[1][1];
      }
    }

    const arr = (v) => Math.round(v * 10) / 10;

    const correction = CORRECTIONS[p.SU_A3] || {};

    entites.push({
      id: p.SU_A3,
      fr: correction.fr || p.NAME_FR,
      en: correction.en || p.NAME_EN,
      continent: continentJouable(p),
      souverain: p.SOVEREIGNT,
      d,
      aire: arr(aireTotale),
      pastille: aireTotale < SEUIL_PASTILLE || !d,
      zone: [arr(bornes[0][0]), arr(bornes[0][1]), arr(bornes[1][0]), arr(bornes[1][1])],
    });
  }

  const parNom = new Map();
  for (const e of entites) {
    const cle = e.fr.toLowerCase();
    if (!parNom.has(cle)) parNom.set(cle, []);
    parNom.get(cle).push(e.id);
  }
  const homonymes = [...parNom.entries()].filter(([, ids]) => ids.length > 1);
  if (homonymes.length) {
    console.error(`\n${jeu.nom} : noms français en double, à traiter dans CORRECTIONS —`);
    homonymes.forEach(([nom, ids]) => console.error(`  « ${nom} » : ${ids.join(', ')}`));
    process.exit(1);
  }

  const hauteur = Math.ceil(basDuPlan);

  const sortie = {
    version: 1,
    perimetre: jeu.nom,
    largeur: LARGEUR,
    hauteur,
    entites: entites.sort((a, b) => a.fr.localeCompare(b.fr, 'fr')),
  };

  const cible = path.join(SORTIE, `carte-${jeu.nom}.json`);
  fs.writeFileSync(cible, JSON.stringify(sortie));
  const ko = (fs.statSync(cible).size / 1024).toFixed(0);

  console.log(`\n${jeu.nom} :`);
  console.log(`  entités        ${entites.length} (attendu ${jeu.attendu}, ${exclues} exclue(s))`);
  console.log(`  pastilles      ${entites.filter((e) => e.pastille).length}`);
  console.log(`  sans contour   ${minuscules} (jouables via leur pastille)`);
  console.log(`  dimensions     ${LARGEUR} × ${hauteur}`);
  console.log(`  poids          ${ko} Ko`);
  if (anomalies.length) {
    console.log(`  ANOMALIES      ${anomalies.length}`);
    anomalies.forEach((a) => console.log(`    - ${a}`));
  }
}

fs.mkdirSync(SORTIE, { recursive: true });
for (const jeu of JEUX) traiter(jeu);
console.log('\nTerminé.');
