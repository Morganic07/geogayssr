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
const PORTEE_SILHOUETTE = 0.9;
const PORTEE_MINI = 8;
const POINTS_SILHOUETTE = 20;
const AIRE_RELATIVE_MINI = 0.01;
const REMPLISSAGE_MINI = 0.06;

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
  { nom: 'onu', fichier: 'ne_10m_admin_0_countries', attendu: 197, filtreOnu: true, capitales: true },
  { nom: 'units', fichier: 'ne_10m_admin_0_map_units', attendu: 298 },
  { nom: 'subunits', fichier: 'ne_10m_admin_0_map_subunits', attendu: 360, marquerHorsOnu: true },
];

const CORPS_ONU = new Set(['RUA', 'RUE']);

const SILHOUETTE_MORCEAU_SEUL = new Set(['USA', 'NOR']);

const FICHIER_VILLES = 'ne_10m_populated_places';

const CAPITALES_MULTIPLES = {
  ZAF: { principale: 'Pretoria', aussi: ['Le Cap', 'Bloemfontein'] },
  BEN: { principale: 'Porto-Novo', aussi: ['Cotonou'] },
  MMR: { principale: 'Naypyidaw', aussi: [] },
  BOL: { principale: 'Sucre', aussi: ['La Paz'] },
  CHL: { principale: 'Santiago', aussi: [] },
  CIV: { principale: 'Yamoussoukro', aussi: ['Abidjan'] },
  SWZ: { principale: 'Mbabane', aussi: ['Lobamba'] },
  ISR: { principale: 'Jérusalem', aussi: ['Tel Aviv'] },
  JPN: { principale: 'Tokyo', aussi: [] },
  MYS: { principale: 'Kuala Lumpur', aussi: ['Putrajaya'] },
  MAR: { principale: 'Rabat', aussi: [] },
  NGA: { principale: 'Abuja', aussi: [] },
  NLD: { principale: 'Amsterdam', aussi: ['La Haye'] },
  PHL: { principale: 'Manille', aussi: [] },
  LKA: { principale: 'Colombo', aussi: ['Sri Jayawardenapura'] },
  TZA: { principale: 'Dodoma', aussi: ['Dar es Salam'] },
};

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

function centreSpherique(geometrie) {
  const morceaux = polygones(geometrie);
  if (morceaux.length === 0) return null;

  let principal = null;
  for (const poly of morceaux) {
    const aire = Math.abs(d3.geoArea(poly));
    if (!principal || aire > principal.aire) principal = { aire, poly };
  }

  const centre = d3.geoCentroid(principal.poly);
  if (!centre || !centre.every(estFini)) return null;
  return [Math.round(centre[0] * 100) / 100, Math.round(centre[1] * 100) / 100];
}

function ecart(a, b) {
  const dx = Math.max(a[0][0] - b[1][0], b[0][0] - a[1][0], 0);
  const dy = Math.max(a[0][1] - b[1][1], b[0][1] - a[1][1], 0);
  return Math.hypot(dx, dy);
}

function fusionner(a, b) {
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}

function morceauxDessines(d) {
  const morceaux = [];
  for (const bloc of d.split('M')) {
    if (!bloc) continue;
    const points = [];
    const re = /(-?[\d.]+),(-?[\d.]+)/g;
    let m;
    while ((m = re.exec(bloc))) points.push([Number(m[1]), Number(m[2])]);
    if (points.length < 3) continue;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, double = 0;
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      const [xs, ys] = points[(i + 1) % points.length];
      double += x * ys - xs * y;
    }
    morceaux.push({ bornes: [[x0, y0], [x1, y1]], aire: Math.abs(double) / 2 });
  }
  return morceaux;
}

function cadreSilhouette(d, id) {
  const tous = morceauxDessines(d).sort((a, b) => b.aire - a.aire);
  if (tous.length === 0) return null;
  if (SILHOUETTE_MORCEAU_SEUL.has(id)) return tous[0].bornes;

  const seuil = tous[0].aire * AIRE_RELATIVE_MINI;
  const morceaux = tous.filter((m) => m.aire >= seuil);

  const surface = (c) => Math.max(c[1][0] - c[0][0], 1) * Math.max(c[1][1] - c[0][1], 1);

  let cadre = morceaux[0].bornes;
  let aireRetenue = morceaux[0].aire;
  const pris = new Set([0]);
  let ajout = true;

  while (ajout) {
    ajout = false;
    const taille = Math.max(cadre[1][0] - cadre[0][0], cadre[1][1] - cadre[0][1]);
    const portee = Math.max(taille * PORTEE_SILHOUETTE, PORTEE_MINI);
    for (let i = 1; i < morceaux.length; i++) {
      if (pris.has(i)) continue;
      if (ecart(cadre, morceaux[i].bornes) > portee) continue;
      const candidat = fusionner(cadre, morceaux[i].bornes);
      const remplissage = (aireRetenue + morceaux[i].aire) / surface(candidat);
      if (remplissage < REMPLISSAGE_MINI && surface(candidat) > surface(cadre) * 1.2) continue;
      cadre = candidat;
      aireRetenue += morceaux[i].aire;
      pris.add(i);
      ajout = true;
    }
  }
  return cadre;
}

function chargerCapitales() {
  const chemin = path.join(CACHE, FICHIER_VILLES + '.geojson');
  if (!fs.existsSync(chemin)) {
    console.error(`\n${FICHIER_VILLES} absent du cache : lance « npm run donnees » pour le récupérer`);
    process.exit(1);
  }
  const brut = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  return brut.features
    .filter((f) => /^Admin-0 capital/.test(f.properties.FEATURECLA))
    .map((f) => ({
      fr: f.properties.NAME_FR || f.properties.NAME,
      en: f.properties.NAME_EN || f.properties.NAME,
      point: [f.properties.LONGITUDE, f.properties.LATITUDE],
    }))
    .filter((c) => c.fr && c.point.every(estFini));
}

function attribuerCapitales(features, villes) {
  const parPays = new Map();
  for (const ville of villes) {
    for (const f of features) {
      if (!d3.geoContains(f, ville.point)) continue;
      const id = f.properties.SU_A3;
      if (!parPays.has(id)) parPays.set(id, []);
      parPays.get(id).push(ville);
      break;
    }
  }
  return parPays;
}

function choisirCapitale(id, trouvees, anomalies) {
  const regle = CAPITALES_MULTIPLES[id];
  if (!regle) {
    if (trouvees.length === 1) return { principale: trouvees[0], noms: [trouvees[0]] };
    anomalies.push(`${id} : ${trouvees.length} capitales sans règle, à trancher dans CAPITALES_MULTIPLES`);
    return null;
  }

  const parNom = new Map(trouvees.map((c) => [c.fr, c]));
  const principale = parNom.get(regle.principale);
  if (!principale) {
    anomalies.push(`${id} : « ${regle.principale} » introuvable parmi ${trouvees.map((c) => c.fr).join(', ')}`);
    return null;
  }

  const noms = [principale];
  for (const nom of regle.aussi) {
    const autre = parNom.get(nom);
    if (autre) noms.push(autre);
    else anomalies.push(`${id} : « ${nom} » introuvable, réponse alternative ignorée`);
  }
  return { principale, noms };
}

function traiter(jeu, nomsOnu) {
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

  const capitalesParPays = jeu.capitales
    ? attribuerCapitales(retenues, chargerCapitales())
    : new Map();

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

    const points = d ? (d.match(/[ML]/g) || []).length : 0;
    const silhouette = points >= POINTS_SILHOUETTE ? cadreSilhouette(d, p.SU_A3) : null;

    const entite = {
      id: p.SU_A3,
      fr: correction.fr || p.NAME_FR,
      en: correction.en || p.NAME_EN,
      continent: continentJouable(p),
      souverain: p.SOVEREIGNT,
      d,
      aire: arr(aireTotale),
      pastille: aireTotale < SEUIL_PASTILLE || !d,
      zone: [arr(bornes[0][0]), arr(bornes[0][1]), arr(bornes[1][0]), arr(bornes[1][1])],
    };

    const centre = centreSpherique(source.geometry);
    if (centre) entite.centre = centre;
    else anomalies.push(`${p.SU_A3} (${p.NAME_FR}) : centre introuvable, pas d'indice de distance`);

    const trouvees = capitalesParPays.get(p.SU_A3);
    if (trouvees && trouvees.length) {
      const choix = choisirCapitale(p.SU_A3, trouvees, anomalies);
      if (choix) {
        const xy = projection(choix.principale.point);
        if (xy && xy.every(estFini)) {
          entite.capitale = {
            fr: choix.principale.fr,
            point: [arr(xy[0]), arr(xy[1])],
            noms: [...new Set(choix.noms.flatMap((c) => [c.fr, c.en]))],
          };
        }
      }
    }

    if (silhouette) {
      entite.forme = [
        arr(silhouette[0][0]), arr(silhouette[0][1]),
        arr(silhouette[1][0]), arr(silhouette[1][1]),
      ];
    }

    entites.push(entite);
  }

  let horsOnu = 0;
  if (jeu.marquerHorsOnu) {
    if (!nomsOnu || nomsOnu.size === 0) {
      console.error(`\n${jeu.nom} : les noms du périmètre ONU manquent, impossible de marquer le hors-ONU`);
      process.exit(1);
    }
    for (const e of entites) {
      if (nomsOnu.has(e.fr) || CORPS_ONU.has(e.id)) continue;
      e.horsOnu = true;
      horsOnu++;
    }
    if (horsOnu === 0) {
      console.error(`\n${jeu.nom} : aucune entité hors ONU, la carte serait vide`);
      process.exit(1);
    }
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
  if (jeu.marquerHorsOnu) console.log(`  hors ONU       ${horsOnu} (jouables dans le périmètre hors-onu)`);
  if (jeu.capitales) console.log(`  capitales      ${entites.filter((e) => e.capitale).length}`);
  if (anomalies.length) {
    console.log(`  ANOMALIES      ${anomalies.length}`);
    anomalies.forEach((a) => console.log(`    - ${a}`));
  }

  return entites;
}

fs.mkdirSync(SORTIE, { recursive: true });
let nomsOnu = null;
for (const jeu of JEUX) {
  const entites = traiter(jeu, nomsOnu);
  if (jeu.nom === 'onu') nomsOnu = new Set(entites.map((e) => e.fr));
}
console.log('\nTerminé.');
