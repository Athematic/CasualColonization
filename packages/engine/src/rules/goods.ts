export const GOODS = [
  'food',
  'sugar',
  'tobacco',
  'cotton',
  'furs',
  'lumber',
  'ore',
  'silver',
  'horses',
  'rum',
  'cigars',
  'cloth',
  'coats',
  'tradeGoods',
  'tools',
  'muskets',
] as const;

export type GoodId = (typeof GOODS)[number];

/** Things a colony produces that are not stored as goods. */
export type ProductId = GoodId | 'hammers' | 'bells' | 'crosses';

export interface GoodDef {
  id: GoodId;
  name: string;
  /** Starting European sell price per unit. */
  price: number;
  /** Difference between buy and sell price. */
  spread: number;
  /** Units traded before the price moves by one step. */
  elasticity: number;
  minPrice: number;
  maxPrice: number;
  /** Value per unit when sold to a native settlement. */
  nativeValue: number;
}

const g = (
  id: GoodId,
  name: string,
  price: number,
  spread: number,
  elasticity: number,
  minPrice: number,
  maxPrice: number,
  nativeValue: number,
): GoodDef => ({ id, name, price, spread, elasticity, minPrice, maxPrice, nativeValue });

export const GOOD_DEFS: Record<GoodId, GoodDef> = {
  food: g('food', 'Food', 1, 7, 400, 1, 8, 0.5),
  sugar: g('sugar', 'Sugar', 4, 2, 200, 1, 12, 1),
  tobacco: g('tobacco', 'Tobacco', 4, 2, 200, 1, 12, 1),
  cotton: g('cotton', 'Cotton', 2, 2, 200, 1, 10, 1),
  furs: g('furs', 'Furs', 4, 2, 200, 1, 12, 1),
  lumber: g('lumber', 'Lumber', 1, 1, 400, 1, 4, 0.5),
  ore: g('ore', 'Ore', 4, 2, 200, 1, 10, 1),
  silver: g('silver', 'Silver', 19, 1, 100, 1, 20, 2),
  horses: g('horses', 'Horses', 1, 1, 300, 1, 6, 2),
  rum: g('rum', 'Rum', 10, 1, 150, 1, 20, 3),
  cigars: g('cigars', 'Cigars', 10, 1, 150, 1, 20, 3),
  cloth: g('cloth', 'Cloth', 10, 1, 150, 1, 20, 3),
  coats: g('coats', 'Coats', 10, 1, 150, 1, 20, 3),
  tradeGoods: g('tradeGoods', 'Trade Goods', 1, 1, 300, 1, 6, 3),
  tools: g('tools', 'Tools', 1, 1, 300, 1, 6, 2),
  muskets: g('muskets', 'Muskets', 2, 1, 300, 1, 8, 3),
};

export const PRODUCT_NAMES: Record<ProductId, string> = {
  ...Object.fromEntries(GOODS.map((id) => [id, GOOD_DEFS[id].name])),
  hammers: 'Hammers',
  bells: 'Liberty Bells',
  crosses: 'Crosses',
} as Record<ProductId, string>;

export function emptyGoods(): Record<GoodId, number> {
  return Object.fromEntries(GOODS.map((id) => [id, 0])) as Record<GoodId, number>;
}
