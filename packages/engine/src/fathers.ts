import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { colonyWorkers, createUnit, message, player, reveal } from './queries.js';
import { weightedPick } from './rng.js';
import { FATHER_CATEGORIES, FATHERS, fatherCost, type FatherCategory, type FatherId } from './rules/fathers.js';
import { NATIONS } from './rules/nations.js';
import type { GameState, Player } from './types.js';

export function hasFather(s: GameState, nation: Player['id'], id: FatherId): boolean {
  return s.players.find((p) => p.id === nation)?.fathers.includes(id) ?? false;
}

export function nextFatherCost(s: GameState, p: Player): number {
  return fatherCost(p.fathers.length, s.config.nations.length);
}

/** Draws one candidate per category from the fathers who have not joined yet. */
export function offerFathers(s: GameState, p: Player): void {
  const offer: Partial<Record<FatherCategory, FatherId>> = {};
  const lateGame = s.turn > 120;
  for (const cat of FATHER_CATEGORIES) {
    const pool = Object.values(FATHERS).filter((f) => f.category === cat && !p.fathers.includes(f.id));
    if (!pool.length) continue;
    offer[cat] = weightedPick(s, pool.map((f) => [f.id, f.weight + (lateGame && f.category === 'political' ? 2 : 0)] as [FatherId, number]));
  }
  p.fatherOffer = offer;
}

export function chooseFather(s: GameState, nation: Player['id'], id: FatherId): void {
  const p = player(s, nation);
  if (!Object.values(p.fatherOffer).includes(id)) fail(`${FATHERS[id].name} is not among the candidates.`);
  p.currentFather = id;
  track(nation, 'cmd:chooseFather');
}

/** AI players pick a father by simple preference. */
const AI_PREFERENCE: FatherId[] = [
  'thomasJefferson', 'williamBrewster', 'peterStuyvesant', 'pocahontas', 'thomasPaine', 'williamPenn', 'adamSmith',
  'simonBolivar', 'hernandoDeSoto', 'ferdinandMagellan', 'laSalle', 'paulRevere', 'georgeWashington',
];

/** Collects liberty bells for the Continental Congress; called once per turn for each player. */
export function processCongress(s: GameState, p: Player): void {
  if (!p.currentFather) {
    const offered = Object.values(p.fatherOffer) as FatherId[];
    if (!offered.length) return;
    if (p.human) return;
    p.currentFather = AI_PREFERENCE.find((f) => offered.includes(f)) ?? offered[0];
  }
  const cost = nextFatherCost(s, p);
  if (p.fatherBells < cost) return;
  p.fatherBells -= cost;
  joinCongress(s, p, p.currentFather);
}

export function joinCongress(s: GameState, p: Player, id: FatherId): void {
  p.fathers.push(id);
  p.currentFather = null;
  track(p.id, 'fathers:joined');
  const def = FATHERS[id];
  message(s, `${def.name} joins the Continental Congress of ${NATIONS[p.id].name}. ${def.effect}`, p.id);
  noteHistory(s, 'father', [p.id], `${def.name} joins the Continental Congress of ${NATIONS[p.id].name}.`);
  for (const other of s.players) {
    if (other.id !== p.id) message(s, `${def.name} has joined the Continental Congress of ${NATIONS[p.id].name}.`, other.id);
  }
  const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id);
  switch (id) {
    case 'pocahontas':
      for (const st of Object.values(s.settlements)) st.tension[p.id] = 0;
      for (const t of s.tribes) t.stance[p.id] = 'peace';
      break;
    case 'johnPaulJones':
      createUnit(s, p.id, 'frigate', { kind: 'europe' });
      break;
    case 'laSalle':
      for (const c of colonies) if (colonyWorkers(s, c).length >= 3 && c.buildings.stockade === 0) c.buildings.stockade = 1;
      break;
    case 'franciscoDeCoronado':
      for (const c of Object.values(s.colonies)) reveal(s, p.id, c.x, c.y, 3);
      break;
    case 'simonBolivar':
      for (const c of colonies) c.liberty += Math.round(200 * colonyWorkers(s, c).length * 0.2);
      break;
    case 'bartolomeDeLasCasas':
      for (const u of Object.values(s.units)) if (u.owner === p.id && u.type === 'nativeConvert') u.type = 'freeColonist';
      break;
    case 'jakobFugger':
      p.boycotts = {};
      break;
  }
  offerFathers(s, p);
}
