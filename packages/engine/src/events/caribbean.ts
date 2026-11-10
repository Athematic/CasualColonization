/**
 * The event set of The Caribbean, 1650–1750 (scenarios/caribbean.ts; docs/design/events.md): a few
 * of the Americas' events that fall in the century, two of them rewritten for a world without furs,
 * and three of the West Indies' own: the hurricane that sank Lord Willoughby's fleet (1666), the
 * Port Royal earthquake (1692) and the end of the Darien scheme (1699–1700).
 *
 * Written, like the Americas' set, to be period-appropriate and respectful: no events that make
 * light of slavery, of the epidemics that devastated Indigenous peoples, or of violence for
 * flavour. The plantation economy of the islands rested on enslaved Africans; the game does not
 * model it, and no event here pretends otherwise or turns it into a reward.
 */
import { player } from '../queries.js';
import type { GoodId } from '../rules/goods.js';
import type { GameState } from '../types.js';
import { HISTORICAL_EVENTS, RANDOM_EVENTS } from './americas.js';
import { colony, coloniesOf, loyalNation, settledNation } from './targets.js';
import type { EventDef, EventVars } from './types.js';

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Crosses equal to a share of what the nation needs for its next immigrant. */
const crossesShare = (share: number) => (s: GameState, v: EventVars) => {
  v.amount = Math.max(5, Math.round(player(s, v.nation).crossesRequired * share));
};

const americas = (id: string): EventDef => {
  const def = [...HISTORICAL_EVENTS, ...RANDOM_EVENTS].find((d) => d.id === id);
  if (!def) throw new Error(`No Americas event ${id}.`);
  return def;
};

/** A colony on the coast, where news and ships arrive. */
const coastalColony = colony({ coastal: true });

export const CARIBBEAN_HISTORICAL: EventDef[] = [
  {
    id: 'willoughby-hurricane',
    kind: 'historical',
    title: 'The hurricane of 1666',
    text: "A hurricane has swept through the Leeward Islands. Lord Willoughby, Governor of Barbados, was sailing with a fleet to retake St Kitts from the French; his ships were scattered and sunk off Guadeloupe and he was lost with them. The colonies of {nation} were battered too: work goes slowly while they rebuild.",
    years: [1666, 1666],
    chance: 0.5,
    target: settledNation,
    effects: [{ kind: 'production', pct: -20, turns: 3, scope: 'nation' }],
    endText: 'The colonies of {nation} have recovered from the hurricane.',
  },
  americas('huguenots'),
  {
    id: 'port-royal-earthquake',
    kind: 'historical',
    title: 'The Port Royal earthquake',
    text: 'On 7 June 1692 an earthquake struck Port Royal in Jamaica, the richest and most notorious harbour of the West Indies. Two-thirds of the town slid into the sea and about two thousand people died; many more died of fever in the weeks after. Survivors are looking for a new home, and some ask for passage to {colony}.',
    years: [1692, 1692],
    chance: 0.5,
    target: coastalColony,
    prepare: (_, v) => {
      v.cost = 200;
    },
    choices: [
      {
        label: 'Send a ship with provisions and bring survivors ({cost} gold)',
        cost: '$cost',
        result: 'Your ship brings food to Port Royal and returns with a ship\'s carpenter who lost everything in the earthquake; he settles in {colony}.',
        effects: [{ kind: 'unit', type: 'masterCarpenter', where: 'colony' }],
      },
      {
        label: 'Leave it to the Governor of Jamaica',
        result: 'The survivors rebuild across the harbour, at a place that will become Kingston.',
        effects: [],
      },
    ],
  },
  americas('brazilian-gold'),
  {
    id: 'darien',
    kind: 'historical',
    title: 'The end of Darien',
    text: "The Company of Scotland's colony at Darien, on the Isthmus, has failed: fever, hunger and the Spanish have driven the settlers from New Edinburgh, and the second expedition has surrendered Fort St Andrew. At home, many Scots have lost their savings in the Company, and its debts reach your treasury too ({cost} gold lost).",
    years: [1699, 1700],
    chance: 0.5,
    target: (s, nation, r) => (nation === 'scotland' ? loyalNation(s, nation, r) : null),
    prepare: (s, v) => {
      const gold = player(s, v.nation).gold;
      if (gold < 100) return false;
      // The loss is shown as {cost}; the gold effect takes it as a negative amount.
      v.cost = roundTo(gold * 0.15, 50);
      v.amount = -v.cost;
    },
    effects: [{ kind: 'gold', amount: '$amount' }],
  },
  {
    id: 'darien-survivors',
    kind: 'historical',
    title: 'Survivors from Darien',
    text: "The Company of Scotland's colony at Darien, on the Isthmus, has failed: fever, hunger and the Spanish have driven the settlers from New Edinburgh. King William has forbidden the English colonies to help them. A ship of starving survivors has put in at {colony}.",
    years: [1699, 1700],
    chance: 0.5,
    target: (s, nation, r) => (nation === 'scotland' ? null : coastalColony(s, nation, r)),
    prepare: (_, v) => {
      v.cost = 100;
    },
    choices: [
      {
        label: 'Feed them and let them stay ({cost} gold)',
        cost: '$cost',
        result: 'Some of the survivors recover and settle in {colony}.',
        effects: [{ kind: 'unit', type: 'freeColonist', where: 'colony' }],
      },
      {
        label: 'Send them on their way',
        result: 'The survivors sail on towards New York.',
        effects: [],
      },
    ],
  },
  americas('spanish-succession'),
  {
    id: 'great-frost',
    kind: 'historical',
    title: 'The Great Frost',
    text: 'The coldest winter in living memory grips Europe; even the canals of Venice freeze, and the harvests of France and the Rhineland fail. Grain is dear in your home port, and hungry families, thousands of Palatines among them, look across the ocean ({amount} crosses towards your next immigrant).',
    years: [1709, 1709],
    chance: 0.5,
    target: loyalNation,
    prepare: crossesShare(0.3),
    effects: [
      { kind: 'price', good: 'food', delta: 1 },
      { kind: 'crosses', amount: '$amount' },
    ],
  },
  {
    id: 'bubble',
    kind: 'historical',
    title: 'The Mississippi and South Sea bubbles',
    text: 'Shares in the Mississippi Company in Paris and the South Sea Company in London are soaring, and speculators buy anything from the colonies: sugar, tobacco and cotton fetch far more in your home port. It cannot last.',
    years: [1719, 1720],
    chance: 0.5,
    target: loyalNation,
    effects: [
      { kind: 'price', good: 'sugar', pct: 40 },
      { kind: 'price', good: 'tobacco', pct: 40 },
      { kind: 'price', good: 'cotton', pct: 40 },
      { kind: 'followUp', event: 'bubble-burst', turns: 4 },
    ],
  },
  {
    id: 'bubble-burst',
    kind: 'historical',
    hidden: true,
    title: 'The bubble bursts',
    text: 'The Mississippi and South Sea companies have collapsed and investors are ruined. Merchants in your home port will hardly pay for sugar, tobacco or cotton.',
    target: loyalNation,
    effects: [
      { kind: 'price', good: 'sugar', pct: -45 },
      { kind: 'price', good: 'tobacco', pct: -45 },
      { kind: 'price', good: 'cotton', pct: -45 },
    ],
  },
];

/** The colonial staples a merchant boom may raise, without furs and coats. */
const STAPLES: GoodId[] = ['sugar', 'tobacco', 'cotton', 'rum', 'cigars', 'cloth', 'silver'];

/** The Americas' random events, without the wolves (none on the islands) and with the islands' staples. */
export const CARIBBEAN_RANDOM: EventDef[] = RANDOM_EVENTS.filter((d) => d.id !== 'wolves').map((d) =>
  d.id !== 'merchant-boom'
    ? d
    : {
        ...d,
        prepare: (s: GameState, v: EventVars, r: () => number) => {
          // A good the nation has in stock if any; otherwise one of the islands' staples.
          const stock = (g: GoodId) => coloniesOf(s, v.nation).reduce((n, c) => n + c.goods[g], 0);
          const held = STAPLES.filter((g) => stock(g) >= 30);
          const list = held.length ? held : STAPLES.slice(0, 3);
          v.good = list[Math.floor(r() * list.length)];
        },
      },
);

export const CARIBBEAN_EVENTS: EventDef[] = [...CARIBBEAN_HISTORICAL, ...CARIBBEAN_RANDOM];
