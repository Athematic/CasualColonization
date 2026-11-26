/**
 * The event set of The North-east, 1000–1850 (scenarios/north-east.ts; native-nations.md section
 * 13): the Americas' historical and random events, which are Europe's news and the colonies' common
 * mishaps (events reach only the European nations, from their arrival), and two of the North-east's
 * own: the fishing fleets on the Grand Banks in the 16th century, and the year without a summer
 * (1816). Hard years, the region's other hardship, are a mechanic of their own (land.ts), and
 * epidemics too (epidemics.ts), on both sides alike.
 *
 * Written, like the Americas' set, to be period-appropriate and respectful: no event makes light of
 * the epidemics, the wars or the loss of land the peoples of the region suffered. Drafted for
 * Simon's review.
 */
import { HISTORICAL_EVENTS, RANDOM_EVENTS } from './americas.js';
import { colony, settledNation } from './targets.js';
import type { EventDef } from './types.js';

export const NORTH_EAST_HISTORICAL: EventDef[] = [
  {
    id: 'grand-banks',
    kind: 'historical',
    title: 'The fishing fleets',
    text: 'Every summer the fishing fleets of Portugal, France, Spain and England cross to the Grand Banks and the coasts of Newfoundland for cod, and dry their catch ashore. A crew from the fleet has wintered at {colony}, and one of its fishermen chooses to stay.',
    years: [1540, 1580],
    chance: 0.3,
    target: colony({ coastal: true }),
    effects: [{ kind: 'unit', type: 'expertFisherman', where: 'colony' }],
  },
  ...HISTORICAL_EVENTS,
  {
    id: 'year-without-summer',
    kind: 'historical',
    title: 'The year without a summer',
    text: 'Snow has fallen in June and frost has come in every month of the summer: the year 1816 has brought killing cold to New England and the St. Lawrence, after a great eruption far away darkened the sky. The fields of {nation} yield much less food this year.',
    years: [1816, 1816],
    chance: 0.6,
    target: settledNation,
    effects: [{ kind: 'production', products: ['food'], pct: -40, turns: 1, scope: 'nation' }],
    endText: 'The cold year is over: the fields of {nation} yield as before.',
  },
];

export const NORTH_EAST_EVENTS: EventDef[] = [...NORTH_EAST_HISTORICAL, ...RANDOM_EVENTS];
