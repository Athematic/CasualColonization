/**
 * The starter event set for The Americas, 1492–1850 (docs/design/events.md): dated historical
 * events from Europe and the Atlantic world, and random events in the Sim City spirit.
 *
 * Written to be period-appropriate and respectful: no events that make light of slavery, of the
 * epidemics that devastated Indigenous peoples, or of violence for flavour.
 */
import { buyPrice } from '../europe.js';
import { colonyWorkers, isWater, neighbours, player, tileAt } from '../queries.js';
import type { GoodId } from '../rules/goods.js';
import { TERRAIN } from '../rules/terrain.js';
import type { UnitTypeId } from '../rules/units.js';
import type { GameState } from '../types.js';
import { damageableBuilding } from './effects.js';
import { colony, coloniesOf, loyalNation, settledNation, shipAtSea, tribeNear } from './targets.js';
import type { EventDef, EventVars } from './types.js';

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Crosses equal to a share of what the nation needs for its next immigrant. */
const crossesShare = (share: number) => (s: GameState, v: EventVars) => {
  v.amount = Math.max(5, Math.round(player(s, v.nation).crossesRequired * share));
};

// ---------------------------------------------------------------------------
// Historical events: once per game, in their window, for every nation still loyal to the Crown.

export const HISTORICAL_EVENTS: EventDef[] = [
  {
    id: 'circumnavigation',
    kind: 'historical',
    title: 'The world encircled',
    text: "The Victoria, the last ship of Magellan's fleet, has come home to Seville under Juan Sebastián Elcano: the first voyage around the world. All Europe talks of it, and more people dream of the New World ({amount} crosses towards your next immigrant).",
    years: [1522, 1526],
    chance: 0.3,
    target: loyalNation,
    prepare: crossesShare(0.5),
    effects: [{ kind: 'crosses', amount: '$amount' }],
  },
  {
    id: 'thirty-years-war',
    kind: 'historical',
    title: "The Thirty Years' War",
    text: "War spreads through the German lands and draws in half of Europe. Armies pay well for muskets, and families uprooted by the fighting look across the ocean ({amount} crosses towards your next immigrant).",
    years: [1618, 1630],
    chance: 0.1,
    target: loyalNation,
    prepare: crossesShare(0.4),
    effects: [
      { kind: 'price', good: 'muskets', pct: 25 },
      { kind: 'crosses', amount: '$amount' },
    ],
  },
  {
    id: 'huguenots',
    kind: 'historical',
    title: 'Huguenot refugees',
    text: 'King Louis XIV has revoked the Edict of Nantes. Thousands of French Protestants, many of them skilled weavers and craftsmen, are leaving France in search of a new home. Some ask for passage to the colonies of {nation}.',
    years: [1685, 1695],
    chance: 0.2,
    // France itself forbade them to leave, let alone settle in New France.
    target: (s, nation, r) => (nation === 'france' ? null : loyalNation(s, nation, r)),
    prepare: (_, v) => {
      v.cost = 300;
    },
    choices: [
      {
        label: 'Pay their passage ({cost} gold)',
        cost: '$cost',
        result: 'A master weaver and other Huguenot families are waiting on the docks.',
        effects: [
          { kind: 'unit', type: 'masterWeaver', where: 'europe' },
          { kind: 'crosses', amount: 10 },
        ],
      },
      {
        label: 'Wish them well',
        result: 'Most of the refugees settle in the Netherlands, England and Prussia; a few find their own way to your colonies.',
        effects: [{ kind: 'crosses', amount: 10 }],
      },
    ],
  },
  {
    id: 'brazilian-gold',
    kind: 'historical',
    title: 'Gold in Minas Gerais',
    text: 'Prospectors have found gold in the hills of Minas Gerais in Brazil. As it pours into Lisbon, silver is worth less in the markets of Europe, and many set sail to seek their fortune in the New World ({amount} crosses towards your next immigrant).',
    years: [1695, 1705],
    chance: 0.15,
    target: loyalNation,
    prepare: crossesShare(0.3),
    effects: [
      { kind: 'price', good: 'silver', pct: -20 },
      { kind: 'crosses', amount: '$amount' },
    ],
  },
  {
    id: 'spanish-succession',
    kind: 'historical',
    title: 'The War of the Spanish Succession',
    text: 'The great powers of Europe go to war over the throne of Spain. Armies and navies need muskets, horses and tools, and pay well for them in the home port of {nation}.',
    years: [1702, 1712],
    chance: 0.15,
    target: loyalNation,
    effects: [
      { kind: 'price', good: 'muskets', pct: 25 },
      { kind: 'price', good: 'horses', pct: 20 },
      { kind: 'price', good: 'tools', pct: 15 },
    ],
  },
  {
    id: 'great-frost',
    kind: 'historical',
    title: 'The Great Frost',
    text: 'The coldest winter in living memory grips Europe and the North Atlantic; even the canals of Venice freeze. A hard season reaches the colonies too: the fields of {nation} yield less food for a while, and furs and coats are much sought after in Europe.',
    years: [1709, 1709],
    chance: 0.5,
    target: settledNation,
    effects: [
      { kind: 'production', products: ['food'], pct: -25, turns: 3, scope: 'nation' },
      { kind: 'price', good: 'furs', pct: 20 },
      { kind: 'price', good: 'coats', pct: 15 },
    ],
    endText: 'The Great Frost is over: the fields of {nation} yield as before.',
  },
  {
    id: 'bubble',
    kind: 'historical',
    title: 'The Mississippi and South Sea bubbles',
    text: 'Shares in the Mississippi Company in Paris and the South Sea Company in London are soaring, and speculators buy anything from the colonies: sugar, tobacco and furs fetch far more in your home port. It cannot last.',
    years: [1719, 1720],
    chance: 0.5,
    target: loyalNation,
    effects: [
      { kind: 'price', good: 'sugar', pct: 40 },
      { kind: 'price', good: 'tobacco', pct: 40 },
      { kind: 'price', good: 'furs', pct: 40 },
      { kind: 'followUp', event: 'bubble-burst', turns: 4 },
    ],
  },
  {
    id: 'bubble-burst',
    kind: 'historical',
    hidden: true,
    title: 'The bubble bursts',
    text: 'The Mississippi and South Sea companies have collapsed and investors are ruined. Merchants in your home port will hardly pay for sugar, tobacco or furs.',
    target: loyalNation,
    effects: [
      { kind: 'price', good: 'sugar', pct: -45 },
      { kind: 'price', good: 'tobacco', pct: -45 },
      { kind: 'price', good: 'furs', pct: -45 },
    ],
  },
  {
    id: 'enlightenment',
    kind: 'historical',
    title: 'The Age of Reason',
    text: "Diderot's Encyclopédie and the writings of Locke, Montesquieu and Voltaire are read in every colonial port. Talk of liberty and natural rights fills the taverns: the colonies of {nation} ring a quarter more liberty bells for a while.",
    years: [1751, 1765],
    chance: 0.1,
    target: settledNation,
    effects: [{ kind: 'production', products: ['bells'], pct: 25, turns: 12, scope: 'nation' }],
    endText: 'The first excitement of the Age of Reason fades in the colonies of {nation}.',
  },
  {
    id: 'seven-years-war',
    kind: 'historical',
    title: "The Seven Years' War",
    text: "War between the great powers spreads around the world, from Europe to India and the Ohio Valley. The Crown asks the colonies of {nation} to share the cost.",
    years: [1756, 1763],
    chance: 0.12,
    target: (s, nation, r) => (loyalNation(s, nation, r) && coloniesOf(s, nation).length ? { nation } : null),
    prepare: (s, v) => {
      v.cost = roundTo(player(s, v.nation).gold * 0.12, 50);
    },
    choices: [
      {
        label: 'Pay a war levy of {cost} gold',
        cost: '$cost',
        result: 'The Crown thanks its loyal colonies.',
        effects: [],
      },
      {
        label: 'Refuse the levy',
        result: 'The Crown raises taxes by 3% instead. Colonists grumble about taxes they never voted for, and ring more liberty bells.',
        effects: [
          { kind: 'tax', delta: 3 },
          { kind: 'production', products: ['bells'], pct: 15, turns: 8, scope: 'nation' },
        ],
      },
    ],
    defaultChoice: 1,
  },
];

// ---------------------------------------------------------------------------
// Random events: each round a nation may have one (RANDOM_EVENT_RATE), picked by weight.

/** Goods a passing captain may offer cheaply. */
const CARGO_GOODS: GoodId[] = ['tools', 'cloth', 'tradeGoods', 'muskets'];

/** Experts who may come as skilled immigrants. */
const SKILLED: UnitTypeId[] = ['expertFarmer', 'expertFisherman', 'expertLumberjack', 'expertOreMiner', 'masterCarpenter', 'masterBlacksmith', 'masterWeaver', 'masterTobaccoPlanter'];

/** Whether a tile next to the colony could get a bonus resource. */
const hasFindSpot = (s: GameState, c: { x: number; y: number }) =>
  neighbours(s, c.x, c.y).some(({ x, y }) => {
    const t = tileAt(s, x, y);
    return !!t && !isWater(t) && !t.b && !t.f && !!TERRAIN[t.t].bonusGood;
  });

/** The good (food left out) with the most valuable stock in a colony. */
function mostValuable(s: GameState, v: EventVars): GoodId | undefined {
  const c = v.colony ? s.colonies[v.colony] : undefined;
  if (!c) return undefined;
  const p = player(s, v.nation);
  let best: GoodId | undefined;
  for (const g of Object.keys(c.goods) as GoodId[]) {
    if (g === 'food' || c.goods[g] < 20) continue;
    if (!best || c.goods[g] * p.market[g].price > c.goods[best] * p.market[best].price) best = g;
  }
  return best;
}

export const RANDOM_EVENTS: EventDef[] = [
  {
    id: 'storm',
    kind: 'random',
    title: 'A storm at sea',
    text: 'A violent storm has caught the {ship} at sea. She limps on with torn sails and a leaking hull: two turns of repairs, and part of her cargo went overboard.',
    weight: 8,
    target: shipAtSea,
    effects: [{ kind: 'damageShip', turns: 2, cargoPct: 30 }],
  },
  {
    id: 'fire',
    kind: 'random',
    title: 'Fire in {colony}',
    text: 'Fire has broken out in {colony} and spread to the {building}. The colonists put it out, but the building is badly damaged.',
    weight: 5,
    target: colony({ minPop: 2, filter: (_, c) => !!damageableBuilding(c) }),
    prepare: (s, v) => {
      const c = s.colonies[v.colony!];
      const b = damageableBuilding(c);
      if (!b) return false;
      v.building = b;
      v.cost = 50 + 25 * c.buildings[b];
    },
    choices: [
      {
        label: 'Pay carpenters {cost} gold to repair it at once',
        cost: '$cost',
        result: 'Hired carpenters have the {building} repaired within days.',
        effects: [],
      },
      {
        label: 'Let it go',
        result: 'The {building} is beyond repair and drops back a level.',
        effects: [{ kind: 'damageBuilding' }],
      },
    ],
  },
  {
    id: 'bumper-harvest',
    kind: 'random',
    title: 'A bumper harvest in {colony}',
    text: 'Kind weather and rich soil: the fields around {colony} give a bumper harvest ({amount} food, and more to come next turn).',
    weight: 8,
    target: colony({ minPop: 2 }),
    prepare: (s, v) => {
      v.amount = Math.min(80, 20 + 10 * colonyWorkers(s, s.colonies[v.colony!]).length);
    },
    effects: [
      { kind: 'goods', good: 'food', amount: '$amount' },
      { kind: 'production', products: ['food'], pct: 25, turns: 2 },
    ],
  },
  {
    id: 'wolves',
    kind: 'random',
    title: 'Wolves at {colony}',
    text: 'A pack of wolves has been raiding the horse pastures of {colony} by night.',
    weight: 5,
    target: colony({ good: { id: 'horses', min: 10 } }),
    prepare: (_, v) => {
      v.cost = 60;
    },
    choices: [
      {
        label: 'Hire a hunter to guard the herds ({cost} gold)',
        cost: '$cost',
        result: 'The hunter drives the pack off; only a few horses were lost.',
        effects: [{ kind: 'loseGoods', good: 'horses', pct: 10 }],
      },
      {
        label: 'Leave it to the herders',
        result: 'The wolves take many horses before they move on.',
        effects: [{ kind: 'loseGoods', good: 'horses', pct: 40 }],
      },
    ],
  },
  {
    id: 'gold-rumour',
    kind: 'random',
    title: 'Gold fever at {colony}',
    text: 'Word spreads that there is gold in the hills beyond {colony}, on {tribe} land. Prospectors arrive, eager to try their luck.',
    weight: 4,
    target: tribeNear(6),
    choices: [
      {
        label: 'Welcome the prospectors',
        result: 'One prospector stays on as a colonist in {colony}. The {tribe} are uneasy about strangers on their land.',
        effects: [
          { kind: 'unit', type: 'freeColonist', where: 'colony' },
          { kind: 'tension', amount: 80 },
        ],
      },
      {
        label: 'Send them home',
        result: 'The prospectors leave. The {tribe} take note of your restraint.',
        effects: [{ kind: 'tension', amount: -20 }],
      },
    ],
  },
  {
    id: 'fever',
    kind: 'random',
    title: 'Fever in {colony}',
    text: 'A fever is going round {colony}. No one has died, but many colonists are too weak to work for a while.',
    weight: 5,
    target: colony({ minPop: 3 }),
    prepare: (s, v) => {
      v.cost = 50 + 10 * colonyWorkers(s, s.colonies[v.colony!]).length;
    },
    choices: [
      {
        label: 'Send for a physician ({cost} gold)',
        cost: '$cost',
        result: 'The physician sets up a sickroom; the colonists will soon be back at work.',
        effects: [{ kind: 'production', pct: -10, turns: 2 }],
      },
      {
        label: 'Let it run its course',
        result: 'The colonists rest until it passes; work in {colony} goes slowly for three turns.',
        effects: [{ kind: 'production', pct: -30, turns: 3 }],
      },
    ],
    endText: '{colony} has recovered from the fever.',
  },
  {
    id: 'cheap-cargo',
    kind: 'random',
    title: "A captain's bargain",
    text: "The captain of a merchant ship calling at {colony} has {amount} {good} he must sell quickly, and offers them for {cost} gold, about half what they cost in Europe.",
    weight: 5,
    target: colony({ coastal: true }),
    prepare: (s, v, r) => {
      const good = CARGO_GOODS[Math.floor(r() * CARGO_GOODS.length)];
      v.good = good;
      v.amount = 50;
      v.cost = roundTo((buyPrice(s, player(s, v.nation), good) * 50) / 2, 10);
    },
    choices: [
      {
        label: 'Buy for {cost} gold',
        cost: '$cost',
        result: 'The {good} are unloaded into the warehouse of {colony}.',
        effects: [{ kind: 'goods', good: '$good', amount: '$amount' }],
      },
      { label: 'Decline', result: 'The captain sails on.', effects: [] },
    ],
  },
  {
    id: 'festival',
    kind: 'random',
    title: 'A festival of the {tribe}',
    text: 'The {tribe} near {colony} are holding a harvest festival and invite your colonists to join them.',
    weight: 5,
    target: tribeNear(5),
    prepare: (_, v) => {
      v.cost = 50;
    },
    choices: [
      {
        label: 'Go, and bring gifts ({cost} gold)',
        cost: '$cost',
        result: 'Your colonists are welcomed warmly. Relations with the {tribe} are much better.',
        effects: [{ kind: 'tension', amount: -150 }],
      },
      {
        label: 'Send a few colonists',
        result: 'A few colonists join the festival. The {tribe} appreciate the visit.',
        effects: [{ kind: 'tension', amount: -60 }],
      },
    ],
  },
  {
    id: 'merchant-boom',
    kind: 'random',
    title: 'Demand for {good}',
    text: 'Merchants in Europe cannot get enough {good}: its price in your home port has risen by a third.',
    weight: 6,
    target: loyalNation,
    when: (s, v) => coloniesOf(s, v.nation).length > 0,
    prepare: (s, v, r) => {
      // A good the nation has in stock if any; otherwise one of the colonial staples.
      const stock = (g: GoodId) => coloniesOf(s, v.nation).reduce((n, c) => n + c.goods[g], 0);
      const staples: GoodId[] = ['sugar', 'tobacco', 'cotton', 'furs', 'rum', 'cigars', 'cloth', 'coats', 'silver'];
      const held = staples.filter((g) => stock(g) >= 30);
      const list = held.length ? held : staples.slice(0, 4);
      v.good = list[Math.floor(r() * list.length)];
    },
    effects: [{ kind: 'price', good: '$good', pct: 33 }],
  },
  {
    id: 'pirates',
    kind: 'random',
    title: 'Pirates off {colony}',
    text: 'A pirate sloop has been seen off {colony}, and the colonists fear for the {good} in the warehouse.',
    weight: 4,
    target: colony({ coastal: true, filter: (s, c) => !!mostValuable(s, { nation: c.owner, colony: c.id }) }),
    prepare: (s, v) => {
      v.good = mostValuable(s, v);
      if (!v.good) return false;
      v.cost = 80;
    },
    choices: [
      {
        label: 'Hire guards for the harbour ({cost} gold)',
        cost: '$cost',
        result: 'With guards on the quay, the pirates sail on.',
        effects: [],
      },
      {
        label: 'Take the risk',
        effects: [
          {
            kind: 'chance',
            p: 0.5,
            text: 'The pirates landed by night and carried off half the {good}.',
            elseText: 'The pirates sailed on without landing.',
            effects: [{ kind: 'loseGoods', good: '$good', pct: 50 }],
          },
        ],
      },
    ],
  },
  {
    id: 'rich-find',
    kind: 'random',
    title: 'A rich find near {colony}',
    text: 'Settlers exploring around {colony} have found a new resource: a fresh spring, a seam of ore or a rich stretch of soil. A tile next to the colony now yields more.',
    weight: 5,
    target: colony({ filter: hasFindSpot }),
    effects: [{ kind: 'bonusResource' }],
  },
  {
    id: 'skilled-immigrant',
    kind: 'random',
    title: 'A skilled immigrant',
    text: 'A {unit} has heard good things of the colonies of {nation} and is waiting on the docks, ready to sail.',
    weight: 5,
    target: loyalNation,
    when: (s, v) => coloniesOf(s, v.nation).length > 0,
    prepare: (_, v, r) => {
      v.unit = SKILLED[Math.floor(r() * SKILLED.length)];
    },
    effects: [{ kind: 'unit', where: 'europe' }],
  },
];

export const AMERICAS_EVENTS: EventDef[] = [...HISTORICAL_EVENTS, ...RANDOM_EVENTS];
