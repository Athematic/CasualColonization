/**
 * Game state -> sprite id candidates, through a pack's mapping. Every function returns the ids to
 * try in order (empty: nothing to try, draw procedurally).
 */
import { TERRAIN, UNIT_TYPES, type BuildingKind, type ProductId, type RoleId, type TerrainId, type Tile, type TribeId, type UnitTypeId } from '@cc/engine';
import type { IdSlot, SpriteMapping } from './pack.js';

/** `expertFurTrapper` -> `expert-fur-trapper`. */
export function kebab(id: string): string {
  return id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** Fills a slot's templates: `{type}` and friends become kebab-case engine ids. */
export function fill(slot: IdSlot | undefined, vars: Record<string, string | number> = {}): string[] {
  if (slot === null || slot === undefined) return [];
  const list = typeof slot === 'string' ? [slot] : slot;
  const out = list.map((t) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? kebab(String(vars[k])) : m)));
  return [...new Set(out)];
}

export class SpriteIds {
  constructor(readonly mapping: SpriteMapping) {}

  unit(type: UnitTypeId, role: RoleId): string[] {
    const m = this.mapping.units;
    const vars = { type, role };
    const typeRole = m.typeRoles?.[type];
    if (typeRole && role in typeRole) return fill(typeRole[role], vars);
    const colonistRole = UNIT_TYPES[type].kind === 'colonist' && role !== 'none';
    if (m.types && type in m.types && !colonistRole) return fill(m.types[type], vars);
    return fill(colonistRole ? m.role : m.plain, vars);
  }

  /** The ground of a tile: plowed first when plowed. */
  terrain(tile: Pick<Tile, 't' | 'p'>): string[] {
    const m = this.mapping.terrain;
    const vars = { terrain: tile.t };
    const base = m.types && tile.t in m.types ? fill(m.types[tile.t], vars) : fill(m.base, vars);
    return tile.p && !TERRAIN[tile.t].water ? [...this.plowed(tile.t), ...base] : base;
  }

  /** The plowed ground of a terrain (that already shows the furrows). */
  plowed(t: TerrainId): string[] {
    return fill(this.mapping.terrain.plowed, { terrain: t });
  }

  /** Water under a tile: its own ground for water tiles, `underLand` for land. */
  water(t: TerrainId): string[] {
    return TERRAIN[t].water ? this.terrain({ t }) : fill(this.mapping.terrain.underLand);
  }

  relief(tile: Pick<Tile, 't' | 'f'>): { kind: 'forest' | 'hills' | 'mountains'; ids: string[] } | undefined {
    const m = this.mapping.relief;
    if (tile.t === 'hills') return { kind: 'hills', ids: fill(m.hills) };
    if (tile.t === 'mountains') return { kind: 'mountains', ids: fill(m.mountains) };
    if (tile.f && TERRAIN[tile.t].forest) return { kind: 'forest', ids: fill(m.forest, { terrain: tile.t }) };
    return undefined;
  }

  bonus(tile: Pick<Tile, 't' | 'f'>): string[] {
    const m = this.mapping.bonus;
    if (tile.f && TERRAIN[tile.t].forest) return fill(m.forest, { terrain: tile.t });
    return fill(m.terrain[tile.t], { terrain: tile.t });
  }

  rumour(): string[] {
    return fill(this.mapping.rumour);
  }

  colony(size: number): string[] {
    let best: { min: number; id: IdSlot } | undefined;
    for (const s of this.mapping.colonies.sizes) if (size >= s.min && (!best || s.min >= best.min)) best = s;
    return best ? fill(best.id) : [];
  }

  defence(stockade: number): string[] {
    return stockade > 0 ? fill(this.mapping.colonies.defences[stockade]) : [];
  }

  settlement(tribe: TribeId, capital: boolean): string[] {
    const m = this.mapping.settlements;
    const own = m.tribes?.[tribe];
    const slot = capital ? (own && 'capital' in own ? own.capital : m.capital) : own && 'camp' in own ? own.camp : m.camp;
    return fill(slot, { tribe });
  }

  /** A building by level (1-based; an unbuilt level 0 shows level 1), lower levels as fallback. */
  building(kind: BuildingKind, level: number): string[] {
    const own = this.mapping.buildingKinds;
    if (own && kind in own) return fill(own[kind], { building: kind, level: Math.max(1, level) });
    const out: string[] = [];
    for (let l = Math.max(1, level); l >= 1; l--) out.push(...fill(this.mapping.buildings, { building: kind, level: l }));
    return out;
  }

  good(product: ProductId): string[] {
    const own = this.mapping.products;
    return fill(own && product in own ? own[product] : this.mapping.goods, { product });
  }

  road(): { hub: string[]; spoke: string[]; diagonal: string[] } {
    const r = this.mapping.roads;
    return { hub: fill(r.hub), spoke: fill(r.spoke), diagonal: fill(r.diagonal) };
  }

  coast(): { edge: string[]; inner: string[]; outer: string[] } {
    const c = this.mapping.coast;
    return { edge: fill(c.edge), inner: fill(c.inner), outer: fill(c.outer) };
  }

  overlay(kind: 'pennant' | 'flag' | 'mission'): string[] {
    return fill(this.mapping.overlays[kind]);
  }
}
