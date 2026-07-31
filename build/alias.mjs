// Génère data/alias.json : toutes les formes acceptées en mode saisie, pour
// chaque entité des trois périmètres.
//
//   node build/alias.mjs
//
// Échoue si deux entités d'un même périmètre partagent une forme : un alias
// ambigu rendrait les deux pays impossibles à nommer.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// La normalisation est importée du module de jeu, jamais recopiée : une copie
// finirait par diverger en silence, et les formes écrites ici cesseraient de
// correspondre à ce que le joueur tape.
import { normaliser } from '../js/saisie.js';

const DOSSIER_DONNEES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const PERIMETRES = ['onu', 'units', 'subunits'];

// Variantes usuelles, historiques et abréviations, écrites à la main.
// Les noms français et anglais des données sont ajoutés automatiquement : cette
// table ne contient que ce qui s'y ajoute.
const ALIAS = {
  // --- États du périmètre ONU ---
  ZAF: ['république sud-africaine'],
  DEU: ['RFA', 'république fédérale d\'Allemagne', 'Deutschland'],
  AND: ['principauté d\'Andorre'],
  SAU: ['Arabie', 'royaume d\'Arabie saoudite'],
  BHR: ['Bahrain'],
  BEL: ['royaume de Belgique'],
  BLZ: ['Honduras britannique'],
  BEN: ['Dahomey'],
  BLR: ['Belarus', 'Russie blanche'],
  MMR: ['Union du Myanmar'],
  BIH: ['Bosnie'],
  BWA: ['Bechuanaland'],
  BFA: ['Burkina', 'Haute-Volta'],
  KHM: ['Kampuchéa'],
  CPV: ['Cabo Verde', 'îles du Cap-Vert'],
  VAT: ['Vatican', 'Saint-Siège', 'État de la cité du Vatican'],
  // Corées : uniquement des formes qui portent le nord ou le sud. Le mot « Corée »
  // seul n'est donné à personne, il désignerait aussi bien l'une que l'autre.
  PRK: ['Corée-du-Nord', 'Corée nord'],
  KOR: ['Corée-du-Sud', 'Corée sud', 'république de Corée du Sud'],
  CIV: ['Ivory Coast'],
  DNK: ['royaume du Danemark'],
  ARE: ['EAU', 'Émirats'],
  SWZ: ['Swaziland'],
  FSM: ['Micronésie'],
  USA: ['États-Unis', 'USA', 'US', 'Amérique', 'États-Unis d\'Amérique', 'United States'],
  ETH: ['Abyssinie'],
  FJI: ['îles Fidji'],
  FRA: ['république française'],
  GHA: ['Côte-de-l\'Or'],
  GRC: ['Hellade'],
  GIN: ['Guinée-Conakry'],
  IND: ['Bharat'],
  IRQ: ['Iraq'],
  IRN: ['Perse'],
  IRL: ['Eire', 'république d\'Irlande'],
  JPN: ['Nippon'],
  KGZ: ['Kirghizie', 'Kirghizstan'],
  KWT: ['Kuwait'],
  LSO: ['Basutoland'],
  MKD: ['Macédoine', 'ancienne république yougoslave de Macédoine'],
  MWI: ['Nyassaland'],
  MUS: ['île Maurice'],
  NAM: ['Sud-Ouest africain'],
  PLW: ['Palau', 'Belau'],
  // L'identifiant de la Palestine est PSX dans les données, pas PSE.
  PSX: ['territoires palestiniens', 'État de Palestine'],
  PN1: ['Papouasie', 'PNG'],
  NLD: ['Hollande', 'Provinces-Unies'],
  CAF: ['Centrafrique'],
  COD: ['RDC', 'Zaïre', 'Congo-Kinshasa', 'Congo RDC'],
  COG: ['Congo-Brazzaville'],
  CHN: ['Chine'],
  GBR: ['Angleterre', 'Grande-Bretagne', 'UK'],
  RUS: ['fédération de Russie'],
  KNA: ['Saint-Kitts-et-Nevis'],
  SLV: ['El Salvador'],
  WSM: ['Samoa occidentales'],
  STP: ['Sao Tomé'],
  SDS: ['Sud-Soudan'],
  LKA: ['Ceylan'],
  CHE: ['Helvétie', 'confédération helvétique'],
  TZA: ['Tanganyika'],
  CZE: ['république tchèque', 'Czechia'],
  THA: ['Siam'],
  TLS: ['Timor-Leste'],
  TTO: ['Trinidad et Tobago'],
  TUR: ['Türkiye', 'Turkey'],
  VUT: ['Nouvelles-Hébrides'],
  VNM: ['Vietnam'],
  ZMB: ['Rhodésie du Nord'],
  ZWE: ['Rhodésie'],

  // --- Unités et sous-unités ---
  PAZ: ['Azores'],
  ALD: ['îles Åland'],
  ATA: ['continent antarctique'],
  ATB: ['continent antarctique'],
  JQI: ['Johnston'],
  LQI: ['Palmyra'],
  KAB: ['Baikonur'],
  BJN: ['Bajo Nuevo'],
  SER: ['Serranilla'],
  GAZ: ['Gaza'],
  USG: ['Guantánamo', 'baie de Guantánamo'],
  SPI: ['champ de glace de Patagonie'],
  CYN: ['République turque de Chypre du Nord'],
  WEB: ['West Bank'],
  ESB: ['Dhekelia'],
  BHF: ['fédération de Bosnie-Herzégovine'],
  SYU: ['FNUOD'],
  FXX: ['France métropolitaine', 'France hexagonale', 'Hexagone'],
  SGS: ['Géorgie du Sud'],
  KAS: ['Siachen'],
  FQI: ['Baker'],
  BVT: ['Bouvet'],
  CXR: ['Christmas'],
  CLP: ['Clipperton'],
  BQI: ['Navassa'],
  HQI: ['Howland'],
  DQI: ['Jarvis'],
  NFK: ['Norfolk'],
  ATC: ['Ashmore-et-Cartier'],
  CYM: ['Caïmans', 'Cayman'],
  CCK: ['Cocos', 'îles Keeling'],
  FRO: ['Féroé'],
  HMD: ['Heard-et-MacDonald'],
  FLK: ['Malouines', 'îles Falkland', 'Falkland'],
  MNP: ['Mariannes du Nord', 'Mariannes'],
  MQI: ['Midway'],
  PFA: ['Paracels'],
  PCN: ['Pitcairn'],
  TCA: ['Turques-et-Caïques'],
  VIR: ['îles Vierges américaines'],
  BRI: ['île brésilienne'],
  IRR: ['Iraq'],
  IRK: ['Kurdistan'],
  REU: ['île de la Réunion'],
  MAC: ['Macau'],
  PMD: ['Madeira'],
  NCL: ['Kanaky'],
  PNX: ['Papouasie', 'PNG'],
  WLS: ['Galles'],
  // Les jumeaux d'un même pays d'un découpage à l'autre doivent porter les mêmes
  // variantes que leur homologue ONU, sinon une saisie acceptée en mode 1 est
  // refusée en mode 2 pour le même pays.
  NLX: ['Hollande', 'Provinces-Unies'],
  INX: ['Bharat'],
  JPX: ['Nippon'],
  USB: ['USA', 'US', 'Amérique', 'États-Unis d\'Amérique', 'United States'],
  ZAX: ['république sud-africaine'],
  NLY: ['Bonaire', 'Antilles néerlandaises'],
  PYF: ['Polynésie', 'Tahiti'],
  PRI: ['Puerto Rico'],
  SOP: ['Puntland'],
  SCR: ['Scarborough'],
  KQI: ['Kingman'],
  BCR: ['Bruxelles'],
  BIS: ['Republika Srpska'],
  SAH: ['Western Sahara', 'RASD'],
  BLM: ['Saint-Barth'],
  // Les deux moitiés de l'île sont homonymes dans les données. En français,
  // « Saint-Martin » désigne la collectivité française : elle garde la forme nue,
  // la partie néerlandaise ne répond qu'à des formes qui la nomment.
  MAF: ['partie française de Saint-Martin', 'Saint-Martin français'],
  SXM: ['Sint Maarten', 'Saint-Martin néerlandais', 'partie néerlandaise de Saint-Martin'],
  NSV: ['Spitzberg', 'Spitsberg'],
  TWN: ['Formose', 'république de Chine'],
  ATF: ['TAAF', 'Terres australes françaises', 'Kerguelen'],
  IOT: ['BIOT'],
  SRV: ['Vojvodine'],
  // Le nom français porté par les données est faux : PGA est l'archipel des
  // Spratleys (souverain « Spratly Islands », au large des Philippines), pas Wake.
  // Le nom anglais des données étant exclu lui aussi, la forme nue et la forme
  // anglaise doivent être rendues à la main : sans elles « Spratly » est refusé
  // alors que « Spratleys » passe.
  PGA: ['îles Spratly', 'Spratly', 'Spratleys', 'îles Spratleys', 'Spratly Islands'],
  WQI: ['île Wake', 'atoll de Wake'],
  WLF: ['Wallis'],
  IOD: ['Diego Garcia'],
  JPI: ['îles Izu'],
  YES: ['Socotra'],
  ZAI: ['îles du Prince-Édouard'],
  GGA: ['Alderney'],
  GNK: ['Fernando Poo'],
  JPV: ['îles Volcano', 'Iwo Jima'],
  KOX: ['Corée-du-Sud', 'Corée sud', 'république de Corée du Sud'],
  // KXI regroupe les îles sud-coréennes, homonymes de la Corée du Sud continentale
  // dans les données : la forme nue revient au continent, bien plus grand.
  KXI: ['îles de la Corée du Sud', 'îles sud-coréennes'],
  FXC: ['Corsica'],
  ECG: ['îles Galápagos'],
  USH: ['Hawaii'],
  SGG: ['Géorgie du Sud'],
  BAC: ['Ascension'],
  CHP: ['Rapa Nui', 'Pâques'],
  EUI: ['Europa'],
  JUI: ['Juan de Nova'],
  AUM: ['Macquarie'],
  ATP: ['Pierre Ier'],
  CHS: ['Sala y Gómez'],
  TEI: ['Tromelin'],
  INA: ['Andaman'],
  ESI: ['Baléares'],
  ESC: ['Canaries'],
  NZC: ['Chatham'],
  JPB: ['Ogasawara', 'îles Bonin'],
  GOI: ['Glorieuses'],
  NZK: ['Kermadec'],
  INN: ['Nicobar'],
  ATS: ['Orcades du Sud'],
  ITI: ['Pélages', 'Lampedusa'],
  JPO: ['Ryukyu', 'Okinawa'],
  SGX: ['Sandwich du Sud'],
  INL: ['Laquedives'],
  RUK: ['Kaliningrad'],
  TLP: ['Oecusse'],
  JPK: ['Hokkaido'],
  GNR: ['Rio Muni'],
  RUC: ['Crimée'],
  CHI: ['Chine'],
  KOD: ['Dokdo', 'Takeshima'],
  // Les données coupent la Russie en deux moitiés portant le même nom. Aucune des
  // deux n'est « la Russie » plus que l'autre : la forme nue n'est donnée ni à
  // l'une ni à l'autre, chacune ne répond qu'à sa moitié.
  RUA: ['Russie asiatique', 'Russie d\'Asie', 'Sibérie'],
  RUE: ['Russie européenne', 'Russie d\'Europe'],
  GGS: ['Sark'],
  // Même mécanique : le nom français porté par FSA est faux, c'est la subdivision
  // principale des Terres australes, autour de Kerguelen, et non les Seychelles.
  FSA: ['Terres australes et antarctiques françaises', 'TAAF', 'Kerguelen', 'îles Kerguelen'],
  TLX: ['Timor-Leste'],
};

// Formes issues des noms des données qu'il faut retirer, parce qu'elles nomment
// une autre entité du même périmètre. Chaque retrait est arbitré dans ALIAS.
const EXCLUSIONS = {
  SXM: ['Saint-Martin'],                     // revient à MAF
  KXI: ['Corée du Sud', 'South Korea'],      // revient à KOX
  RUA: ['Russie', 'Russia'],                 // ne revient à personne
  RUE: ['Russie', 'Russia'],
  PGA: ['Wake', 'Wake Island'],              // revient à WQI, PGA étant les Spratleys
  FSA: ['Seychelles'],                       // revient à SYC, FSA étant les Terres australes
};

// Formes qui ne doivent appartenir à personne : elles désignent au moins deux
// entités concurrentes et aucune ne les porte comme nom officiel.
// « guinée » et « soudan » n'y figurent pas : ce sont les noms français exacts et
// exclusifs de GIN et SDN. Les leur retirer rendrait ces deux pays impossibles à
// nommer. L'interdiction porte sur les alias inventés, pas sur les noms.
const FORMES_INTERDITES = ['corée', 'congo'];

function lireDonnees() {
  const entites = new Map();
  const parPerimetre = new Map();
  for (const perimetre of PERIMETRES) {
    const fichier = path.join(DOSSIER_DONNEES, `carte-${perimetre}.json`);
    const donnees = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    const ids = new Set();
    for (const entite of donnees.entites) {
      ids.add(entite.id);
      if (!entites.has(entite.id)) entites.set(entite.id, { id: entite.id, fr: entite.fr, en: entite.en });
    }
    parPerimetre.set(perimetre, ids);
  }
  return { entites, parPerimetre };
}

function construireFormes(entite) {
  const exclues = new Set((EXCLUSIONS[entite.id] || []).map(normaliser));
  const formes = [];
  for (const brute of [entite.fr, entite.en, ...(ALIAS[entite.id] || [])]) {
    const forme = normaliser(brute);
    if (!forme || exclues.has(forme) || formes.includes(forme)) continue;
    formes.push(forme);
  }
  return formes;
}

function distance(a, b) {
  if (a === b) return 0;
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    const courante = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const cout = a[i] === b[j] ? 0 : 1;
      courante[j + 1] = Math.min(courante[j] + 1, precedente[j + 1] + 1, precedente[j] + cout);
    }
    precedente = courante;
  }
  return precedente[b.length];
}

function main() {
  const { entites, parPerimetre } = lireDonnees();
  const erreurs = [];

  // Une clé inconnue dans les tables écrites à la main est une faute de frappe :
  // silencieusement ignorée, elle priverait une entité de ses variantes.
  for (const [nom, table] of [['ALIAS', ALIAS], ['EXCLUSIONS', EXCLUSIONS]]) {
    for (const id of Object.keys(table)) {
      if (!entites.has(id)) erreurs.push(`${nom} : identifiant inconnu « ${id} »`);
    }
  }

  const sortie = {};
  for (const id of [...entites.keys()].sort()) {
    const formes = construireFormes(entites.get(id));
    if (formes.length === 0) erreurs.push(`${id} : aucune forme acceptée, l'entité serait injouable en saisie`);
    sortie[id] = formes;
  }

  const interdites = new Set(FORMES_INTERDITES.map(normaliser));
  for (const [id, formes] of Object.entries(sortie)) {
    for (const forme of formes) {
      if (interdites.has(forme)) erreurs.push(`${id} : forme interdite « ${forme} », elle désigne plusieurs entités`);
    }
  }

  // Le conflit se juge périmètre par périmètre : deux entités qui ne sont jamais
  // proposées ensemble peuvent porter la même forme sans ambiguïté possible
  // (FRA dans le périmètre ONU et FXX dans les autres sont toutes deux « france »).
  const voisinages = [];
  for (const perimetre of PERIMETRES) {
    const ids = parPerimetre.get(perimetre);
    const parForme = new Map();
    for (const id of ids) {
      for (const forme of sortie[id]) {
        if (!parForme.has(forme)) parForme.set(forme, []);
        parForme.get(forme).push(id);
      }
    }
    for (const [forme, porteurs] of parForme) {
      if (porteurs.length > 1) {
        erreurs.push(`${perimetre} : la forme « ${forme} » désigne ${porteurs.sort().join(', ')}`);
      }
    }
    voisinages.push({ perimetre, parForme });
  }

  if (erreurs.length > 0) {
    console.error(`ÉCHEC : ${erreurs.length} conflit(s) d'alias`);
    for (const erreur of erreurs) console.error(`  - ${erreur}`);
    process.exit(1);
  }

  fs.writeFileSync(path.join(DOSSIER_DONNEES, 'alias.json'), `${JSON.stringify(sortie, null, 1)}\n`);

  const total = Object.values(sortie).reduce((somme, formes) => somme + formes.length, 0);
  console.log(`data/alias.json écrit : ${Object.keys(sortie).length} entités, ${total} formes.`);

  // Avertit sans bloquer : deux entités différentes du même périmètre séparées par
  // une seule lettre sont un piège pour la correspondance approchée du résolveur.
  // Les paires internes à une même entité (« albanie » / « albania ») sont sans
  // danger et ne sont pas signalées.
  const proches = new Set();
  for (const { parForme } of voisinages) {
    const formes = [...parForme.keys()];
    for (let i = 0; i < formes.length; i += 1) {
      for (let j = i + 1; j < formes.length; j += 1) {
        if (parForme.get(formes[i])[0] === parForme.get(formes[j])[0]) continue;
        if (Math.abs(formes[i].length - formes[j].length) > 1) continue;
        if (distance(formes[i], formes[j]) > 1) continue;
        proches.add(`${formes[i]} (${parForme.get(formes[i])[0]}) / ${formes[j]} (${parForme.get(formes[j])[0]})`);
      }
    }
  }
  if (proches.size > 0) {
    console.log(`Avertissement : ${proches.size} paire(s) d'entités distinctes séparées par une seule lettre.`);
    for (const paire of [...proches].sort()) console.log(`  - ${paire}`);
  }
}

main();
