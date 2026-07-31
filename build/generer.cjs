// Projette et simplifie les données Natural Earth en chemins SVG prêts à l'emploi.
// Sortie : data/carte-units.json et data/carte-subunits.json
//
// Tout le coût géographique est payé ici, une fois. Le runtime ne fait que
// lire le résultat : il n'embarque ni d3 ni la moindre dépendance.
//
// La simplification passe par TopoJSON et non par un filtrage anneau par anneau :
// les frontières sont partagées entre voisins, et les simplifier séparément
// ouvrirait des fentes entre les pays.

const fs = require('fs');
const path = require('path');
const d3 = require('d3-geo');
const { topology } = require('topojson-server');
const { presimplify, simplify } = require('topojson-simplify');
const { feature } = require('topojson-client');

const CACHE = path.join(__dirname, 'cache');
const SORTIE = path.join(__dirname, '..', 'data');

const LARGEUR = 2000;          // largeur de référence du plan projeté
const DECIMALES = 1;           // précision des coordonnées, en pixels
const SEUIL_PASTILLE = 12;     // aire projetée (px²) sous laquelle on ajoute une cible cliquable
const SEUIL_SIMPLIF = 0.005;   // aire minimale d'un triangle conservé, en degrés²

// Entités présentes dans Natural Earth mais qui ne sont pas des pays.
const EXCLUES = new Set([
  'KNX', 'KNZ',  // les deux moitiés de la zone démilitarisée coréenne
]);

// Les 193 États membres de l'ONU, en ISO 3166-1 alpha-3.
// Le champ TYPE de Natural Earth ne peut pas servir à les retrouver : il classe
// Israël en « Disputed », Cuba et le Kazakhstan en « Sovereignty ».
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

// Deux observateurs permanents et deux États associés à la Nouvelle-Zélande :
// c'est ce qui porte le total à 197, le chiffre du cahier des charges.
const AUTRES_ONU = ['VAT', 'PSE', 'COK', 'NIU'];
const PERIMETRE_ONU = new Set([...MEMBRES_ONU, ...AUTRES_ONU]);

// Natural Earth se trompe sur quelques libellés, ou donne le même nom à deux
// entités distinctes. Vérifié entité par entité contre le champ SUBUNIT et
// contre la position projetée — FSA est à la latitude de Kerguelen, pas des
// Seychelles ; PGA est dans la zone des Spratleys, pas à Wake.
// Sans ces corrections, les entités homonymes sont injouables en mode saisie.
const CORRECTIONS = {
  FSA: { fr: 'Terres australes françaises', en: 'French Southern Territories' },
  PGA: { fr: 'Îles Spratly', en: 'Spratly Islands' },
  WQI: { fr: 'Île Wake', en: 'Wake Island' },
  SOP: { fr: 'Puntland', en: 'Puntland' },              // NAME_FR disait « Pount », le royaume antique
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

// Retrouve une entité du périmètre ONU quel que soit le champ de code renseigné :
// ISO_A3 vaut « -99 » sur plusieurs entités.
function codesPossibles(p) {
  return [p.ADM0_A3, p.ISO_A3_EH, p.ISO_A3, p.SU_A3].filter((c) => c && c !== '-99');
}

// « Seven seas (open ocean) » n'est pas un continent : c'est le fourre-tout des
// îles éparses. On les rattache à leur région ONU pour que le filtre par zone
// reste utilisable.
function continentJouable(p) {
  if (p.CONTINENT && p.CONTINENT !== 'Seven seas (open ocean)') return p.CONTINENT;
  // REGION_UN dit « Americas » sans trancher entre nord et sud : la sous-région le fait.
  if (p.REGION_UN === 'Americas') {
    return p.SUBREGION === 'South America' ? 'South America' : 'North America';
  }
  return p.REGION_UN && p.REGION_UN !== 'Seven seas (open ocean)' ? p.REGION_UN : 'Océans';
}

// Plusieurs dépendances portent le code ADM0_A3 de leur souverain : Clipperton
// pour la France, Baïkonour pour le Kazakhstan, trois territoires pour
// l'Australie. Sans déduplication, le périmètre ONU en compte 203 au lieu de 197.
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

// Contexte de rendu qui arrondit les coordonnées et supprime les points
// consécutifs identiques — c'est là que se joue une bonne part du poids final.
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
      // Un anneau réduit à moins de trois points ne dessine rien : on le jette.
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

// Décompose une géométrie en polygones individuels, pour mesurer chaque masse
// séparément : le centroïde global des États-Unis tombe au Canada à cause de
// l'Alaska, celui de leur plus grand polygone tombe au bon endroit.
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

  // Les mesures (aire, cadrage) sont prises sur la géométrie d'origine : les
  // micro-États disparaissent à la simplification, mais gardent une position.
  const original = new Map(retenues.map((f) => [f.properties.SU_A3, f]));

  // Simplification topologique, en coordonnées géographiques.
  const topo = simplify(
    presimplify(topology({ pays: { type: 'FeatureCollection', features: retenues } })),
    SEUIL_SIMPLIF
  );
  const simplifiees = feature(topo, topo.objects.pays).features;

  // La projection est calée sur l'ensemble retenu, pour que le cadrage ne
  // dépende pas des entités écartées.
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

    // Plus grand polygone de l'entité : sert au zoom automatique.
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
    // Une entité sans chemin après simplification reste jouable : sa pastille
    // devient sa seule représentation. C'est le cas du Vatican et des îlots.
    if (!d) minuscules++;

    // Emprise de TOUT ce qui est dessiné, et non du seul plus grand morceau :
    // c'est elle qui fixe la hauteur du plan. Prendre `zone` laisserait les
    // îles australes du Chili hors du cadre, donc invisibles et non cliquables.
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
      // zone = boîte du plus grand morceau : [x0, y0, x1, y1]
      zone: [arr(bornes[0][0]), arr(bornes[0][1]), arr(bornes[1][0]), arr(bornes[1][1])],
    });
  }

  // Deux entités d'un même périmètre portant le même nom sont indistinguables
  // au clavier : le mode saisie ne peut alors résoudre ni l'une ni l'autre.
  // On échoue ici plutôt que de livrer des pays injouables.
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
