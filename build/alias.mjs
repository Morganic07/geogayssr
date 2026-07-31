import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normaliser, distance } from '../js/saisie.js';

const DOSSIER_DONNEES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const PERIMETRES = ['onu', 'units', 'subunits'];

const ALIAS = {
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
  MAF: ['partie française de Saint-Martin', 'Saint-Martin français'],
  SXM: ['Sint Maarten', 'Saint-Martin néerlandais', 'partie néerlandaise de Saint-Martin'],
  NSV: ['Spitzberg', 'Spitsberg'],
  TWN: ['Formose', 'république de Chine'],
  ATF: ['TAAF', 'Terres australes françaises', 'Kerguelen'],
  IOT: ['BIOT'],
  SRV: ['Vojvodine'],
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
  RUA: ['Russie asiatique', 'Russie d\'Asie', 'Sibérie'],
  RUE: ['Russie européenne', 'Russie d\'Europe'],
  GGS: ['Sark'],
  FSA: ['Terres australes et antarctiques françaises', 'TAAF', 'Kerguelen', 'îles Kerguelen'],
  TLX: ['Timor-Leste'],
};

const EXCLUSIONS = {
  SXM: ['Saint-Martin'],
  KXI: ['Corée du Sud', 'South Korea'],
  RUA: ['Russie', 'Russia'],
  RUE: ['Russie', 'Russia'],
  PGA: ['Wake', 'Wake Island'],
  FSA: ['Seychelles'],
};

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

function main() {
  const { entites, parPerimetre } = lireDonnees();
  const erreurs = [];

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
