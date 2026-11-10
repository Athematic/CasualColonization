/**
 * Score weights, in one table so a scenario can override them (`Scenario.score`, merged over this
 * table by `scoreWeightsOf(s)`; `scoreBreakdown` / `score` also take a table). Each component is `round(value * weight)`; the total is the sum of
 * the rounded components, so a breakdown always adds up.
 *
 * Calibration (0.7): a few big, developed colonies must score at least as high as many tiny ones,
 * so headcount carries a low weight and development (experts at work, buildings, production,
 * liberty) carries more. Games saved before 0.7 keep the numbers of the old formula in their
 * Progress history (which counted colonists, rebels, fathers and gold only); new turns record
 * the new formula.
 */
export const SCORE_WEIGHTS = {
  /** Per colonist, anywhere (colonies, ships, Europe). Was 1 before 0.7. */
  colonist: 0.5,
  /** Per expert colonist who works in their speciality (an expert farmer on a food tile, an expert weaver at the weaver). */
  expert: 2,
  /** Per building level above what a new colony starts with. */
  building: 1.5,
  /** Per unit of goods (food excluded) produced per turn, averaged over the last `productionTurns` turns. */
  production: 0.25,
  /** Turns averaged for the production component. */
  productionTurns: 10,
  /** Per rebel colonist (colonists times Sons of Liberty share). Was up to 2 per colonist before 0.7. */
  rebel: 1,
  /** Per colony with at least half its colonists in the Sons of Liberty. */
  libertyHalf: 3,
  /** Extra per colony where every colonist is (100%). */
  libertyFull: 3,
  /** Per Founding Father. */
  father: 5,
  /** Per gold piece, counting the treasury and the goods in warehouses at home sell prices (food excluded). */
  wealth: 1 / 800,
  /** Per active trade agreement (a Favoured Nation partnership is an agreement too). */
  tradeAgreement: 3,
  /** Extra per Favoured Nation partnership. */
  favoured: 4,
  /** Per native settlement the nation has met whose tension is below `tensionBelow`. */
  peacefulTribe: 1,
  /** Tension (0 content, 1000 furious) under which a settlement counts as at peace. */
  tensionBelow: 200,
  /** Flat bonus for winning independence. */
  independence: 250,
};

export type ScoreWeights = typeof SCORE_WEIGHTS;
