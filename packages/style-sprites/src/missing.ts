/**
 * The missing-ids check (docs/design/hex-maps.md H15): which sprites a pack lacks for a scenario on a grid.
 *
 * It walks everything the scenario can put on the map or in a panel (its terrains, forests, hills and mountains,
 * bonus resources, rumours, roads, coast bands, colonies and walls, its peoples' settlements, its unit types in
 * every role, braves, its buildings at every level, goods, council members, the overlays and the hall backdrop),
 * resolves each through the pack's mapping, and lists the ones none of whose candidate ids the manifest has.
 * Each missing entry says whether a placeholder exists for it (placeholder.ts). `uncovered` lists what nothing
 * would draw: for a pack with `fallback: 'placeholder'`, missing sprites in a category it claims without a
 * placeholder; for a procedural fallback, nothing (the fallback style draws every piece).
 *
 * On hexes the square-only pieces (coast bands, terrain transitions, road spokes, water under rounded land
 * corners) are not needed and not listed.
 */
import { BUILDINGS, TERRAIN, UNIT_TYPES, type GridKind, type ProductId, type Scenario, type TerrainId } from '@cc/engine';
import { SpriteIds } from './ids.js';
import { completePack, type SpritePack } from './pack.js';
import { PLACEHOLDER_CATEGORIES, placeholderCovers, type SpriteCategory } from './placeholder.js';

export interface MissingEntry {
  category: SpriteCategory;
  /** What is needed: a terrain, `<unitType>:<role>`, `<building>:<level>`, a tribe, … (see placeholderCovers). */
  key: string;
  /** The candidate ids the mapping gives, none of which the manifest has (empty: the mapping maps it to nothing). */
  ids: string[];
  /** Whether a placeholder exists for it. */
  placeholder: boolean;
}

export interface MissingReport {
  pack: string;
  scenario: string;
  grid: GridKind;
  fallback: 'procedural' | 'placeholder';
  /** Per category: how many sprites are needed and how many are missing. */
  categories: Partial<Record<SpriteCategory, { needed: number; missing: number }>>;
  missing: MissingEntry[];
  /** Missing sprites nothing draws instead (see the module comment). */
  uncovered: MissingEntry[];
}

/** Extras over the ground: without them nothing is lost, so they never count as uncovered. */
const OPTIONAL: readonly SpriteCategory[] = ['coast', 'transitions'];

const PRODUCTS_BEYOND_GOODS: readonly ProductId[] = ['hammers', 'bells', 'crosses'];

/**
 * The sprites `pack` lacks for `scenario` on `grid` (default: the scenario's own grid). `has` says whether the
 * pack's manifest has an id; a pack without images (`source.base: null`) has none.
 */
export function missingIds(input: SpritePack, scenario: Scenario, has: (id: string) => boolean, grid: GridKind = scenario.map.grid ?? 'square'): MissingReport {
  const pack = completePack(input);
  const ids = new SpriteIds(pack.mapping);
  const fallback = pack.fallback ?? 'procedural';
  const report: MissingReport = { pack: pack.id, scenario: scenario.id, grid, fallback, categories: {}, missing: [], uncovered: [] };
  const square = grid === 'square';

  const need = (category: SpriteCategory, key: string, list: readonly string[]) => {
    const c = (report.categories[category] ??= { needed: 0, missing: 0 });
    c.needed++;
    if (list.some(has)) return;
    c.missing++;
    const entry: MissingEntry = { category, key, ids: [...list], placeholder: placeholderCovers(category, key) };
    report.missing.push(entry);
    if (fallback === 'placeholder' && !entry.placeholder && !OPTIONAL.includes(category)) report.uncovered.push(entry);
  };

  const terrains = scenario.terrain;
  const land = terrains.filter((t) => !TERRAIN[t].water);
  for (const t of terrains) need('terrain', t, ids.terrain({ t }));
  if (square && land.length) need('terrain', 'under-land', ids.water(land[0]));

  for (const t of land) {
    const r = ids.relief({ t, f: true });
    if (r?.kind === 'forest') need('relief', `forest:${t}`, r.ids);
  }
  for (const t of ['hills', 'mountains'] as const) if (terrains.includes(t)) need('relief', t, ids.relief({ t, f: false })!.ids);

  // Bonus resources: on forests, and by terrain where the mapping has one.
  if (land.some((t) => TERRAIN[t].forest)) need('bonus', 'forest', ids.bonus({ t: land.find((t) => TERRAIN[t].forest)!, f: true }));
  for (const t of terrains) {
    const list = ids.bonus({ t, f: false });
    if (list.length) need('bonus', t, list);
  }
  need('rumour', 'rumour', ids.rumour());

  if (square) {
    const road = ids.road();
    for (const piece of ['hub', 'spoke', 'diagonal'] as const) need('roads', piece, road[piece]);
    const coast = ids.coast();
    for (const piece of ['edge', 'inner', 'outer'] as const) need('coast', piece, coast[piece]);
    if (pack.rules.transitions === 'overlay') {
      for (const t of pack.rules.transitionOrder) if (terrains.includes(t as TerrainId)) need('transitions', t, ids.transition(t).edge);
    }
  }

  for (const s of pack.mapping.colonies.sizes) need('colonies', `size ${s.min}`, ids.colony(s.min));
  if (scenario.buildings.includes('stockade')) {
    for (let level = 1; level <= BUILDINGS.stockade.levels.length; level++) need('defences', String(level), ids.defence(level));
  }

  for (const tribe of scenario.peoples.ids) {
    need('settlements', tribe, ids.settlement(tribe, false));
    need('settlements', `${tribe}:capital`, ids.settlement(tribe, true));
  }

  const roles = ['none', 'soldier', 'dragoon', 'pioneer', 'scout', 'missionary'] as const;
  for (const type of scenario.units) {
    for (const role of roles) {
      if (role !== 'none' && !isColonist(type)) continue;
      need('units', `${type}:${role}`, ids.unit(type, role));
    }
  }
  for (const [armed, mounted] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const) {
    need('braves', `${armed ? 'armed' : ''}${armed && mounted ? '-' : ''}${mounted ? 'mounted' : ''}` || 'plain', ids.brave(armed, mounted));
  }

  for (const kind of scenario.buildings) {
    // The level's own id only: a lower level standing in is still a missing picture.
    for (let level = 1; level <= BUILDINGS[kind].levels.length; level++) need('buildings', `${kind}:${level}`, ids.building(kind, level).slice(0, 1));
  }
  for (const product of [...scenario.goods, ...PRODUCTS_BEYOND_GOODS]) need('goods', product, ids.good(product));
  for (const father of scenario.council.members) need('fathers', father, ids.father(father));
  for (const kind of ['pennant', 'flag', 'mission'] as const) need('overlays', kind, ids.overlay(kind));
  need('backdrops', 'congress-hall', ids.backdrop('congress-hall', scenario.art?.councilHall));
  return report;
}

function isColonist(type: Scenario['units'][number]): boolean {
  return UNIT_TYPES[type].kind === 'colonist';
}

/** The categories a pack draws a placeholder for: all of PLACEHOLDER_CATEGORIES with `fallback: 'placeholder'`, else none. */
export function claimedCategories(pack: Pick<SpritePack, 'fallback'>): readonly SpriteCategory[] {
  return pack.fallback === 'placeholder' ? PLACEHOLDER_CATEGORIES : [];
}

/** A short text summary of a report, one line per category with missing sprites (for test logs and tools). */
export function formatMissing(report: MissingReport): string {
  const lines = [`${report.pack} on ${report.scenario} (${report.grid}), fallback ${report.fallback}: ${report.missing.length} missing, ${report.uncovered.length} uncovered`];
  for (const [cat, c] of Object.entries(report.categories)) {
    if (!c.missing) continue;
    const keys = report.missing.filter((m) => m.category === cat).map((m) => m.key);
    lines.push(`  ${cat}: ${c.missing}/${c.needed} missing (${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''})`);
  }
  return lines.join('\n');
}
