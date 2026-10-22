/**
 * A sprite pack: everything a sprite-based style needs, as data. Where the runtime sprites live,
 * how game concepts map to sprite ids, how each kind of sprite sits on a tile, and which layers
 * stay with the procedural fallback style. `createSpriteStyle(pack, fallback)` turns it into a
 * StylePlugin.
 *
 * Mapped ids are templates. Placeholders are replaced with engine ids in kebab-case:
 * `{type}` unit type, `{role}` role, `{terrain}` terrain, `{tribe}` tribe, `{building}` building
 * kind, `{level}` building level, `{product}` good or product. A slot may hold one template, a
 * list (tried in order, the first sprite that exists wins) or null (always procedural). Anything
 * that resolves to no sprite in the manifest falls back, per sprite, to the fallback style.
 */
import type { BuildingKind, ProductId, RoleId, TerrainId, TribeId, UnitTypeId } from '@cc/engine';
import type { StyleTheme } from '@cc/render-api';

/** One template, several in order of preference, or null for "keep this procedural". */
export type IdSlot = string | readonly string[] | null;

export interface SpriteMapping {
  units: {
    /** A colonist without a role, and every ship, wagon train, artillery and treasure. */
    plain: IdSlot;
    /** A colonist in a role (soldier, dragoon, pioneer, scout, missionary). */
    role: IdSlot;
    /** Per unit type, replacing `plain` (and `role`, unless a role entry exists). */
    types?: Partial<Record<UnitTypeId, IdSlot>>;
    /** Per type and role, e.g. { nativeConvert: { soldier: null } }. */
    typeRoles?: Partial<Record<UnitTypeId, Partial<Record<RoleId, IdSlot>>>>;
  };
  terrain: {
    /** Ground of a land tile, and of high seas and ocean tiles. */
    base: IdSlot;
    /** Plowed land (tried before `base`). */
    plowed: IdSlot;
    /** Water drawn under land tiles, for their rounded corners. */
    underLand: IdSlot;
    /** Per terrain, replacing `base`. */
    types?: Partial<Record<TerrainId, IdSlot>>;
  };
  relief: {
    /** Forest clump over a forested tile. */
    forest: IdSlot;
    hills: IdSlot;
    mountains: IdSlot;
  };
  /** Bonus resource: on a forest, else by terrain. */
  bonus: {
    forest: IdSlot;
    terrain: Partial<Record<TerrainId, IdSlot>>;
  };
  rumour: IdSlot;
  /** Road pieces: a centre hub, a spoke to the top edge and a spoke to the top-left corner. All three or procedural roads. */
  roads: { hub: IdSlot; spoke: IdSlot; diagonal: IdSlot };
  /** Shallow-water bands on water tiles next to land: along the top edge, the top and left edges, the top-left corner. */
  coast: { edge: IdSlot; inner: IdSlot; outer: IdSlot };
  colonies: {
    /** By population: the entry with the largest `min` not above the colony's size. */
    sizes: readonly { min: number; id: IdSlot }[];
    /** Enclosures by stockade level (1 stockade, 2 fort), drawn split into back and front walls. */
    defences: Partial<Record<number, IdSlot>>;
  };
  settlements: {
    camp: IdSlot;
    capital: IdSlot;
    tribes?: Partial<Record<TribeId, { camp?: IdSlot; capital?: IdSlot }>>;
  };
  buildings: IdSlot;
  goods: IdSlot;
  /** White-cloth markers tinted to a nation's colour. */
  overlays: { pennant: IdSlot; flag: IdSlot; mission: IdSlot };
  /** Ids per building kind or product, replacing the templates. */
  buildingKinds?: Partial<Record<BuildingKind, IdSlot>>;
  products?: Partial<Record<ProductId, IdSlot>>;
}

/** Where a sprite square sits: its size as a share of the tile (or box), its anchor point on the tile. */
export interface Placement {
  /** Size of the sprite square relative to the tile (or the unit box). */
  scale: number;
  /** Where the sprite's anchor (its ground point from the manifest) goes, as shares of the tile. */
  x: number;
  y: number;
}

export interface DrawRules {
  /** Unit sprite, relative to the unit box the renderer gives (centred). */
  unit: { scale: number; dy: number };
  forest: Placement;
  hills: Placement;
  mountains: Placement;
  rumour: Placement;
  /** Bonus marker: a square of `size` with its top-left corner at (x, y), shares of the tile. */
  bonus: { size: number; x: number; y: number };
  settlement: Placement;
  /** Mission marker in the missionary nation's colour; null for none. */
  mission: { size: number; x: number; y: number } | null;
  colony: Placement;
  /** Stockade or fort walls, drawn around the colony (back wall behind it, front wall in front). */
  defence: Placement;
  /**
   * The owner's flag on a colony. `pole` is where the pole stands (shares of the tile) and its
   * height; the flag is the tinted `overlays.flag` sprite, or a plain ink pennant without it.
   */
  colonyFlag: { x: number; y: number; height: number } | null;
  /** Unit icons: sprite size relative to the icon, and the owner's pennant on ships and soldiers. */
  unitIcon: { scale: number; pennant: { size: number; minIcon: number } | null };
}

/** Layers a pack may leave to the fallback even when it has sprites for them. */
export type PackLayer = 'water' | 'land' | 'shore' | 'roads' | 'relief' | 'bonus' | 'rumour' | 'settlements' | 'colonies' | 'units' | 'icons';

export interface SpriteSource {
  /** Folder with manifest.json (made by tools/sprite-pipeline), relative to the page or absolute. */
  base: string;
  /** Manifest file name inside `base`. Default manifest.json. */
  manifest?: string;
  /** Query parameter that overrides `base` (remembered in localStorage). Default `sprites`. */
  queryParam?: string;
  /** localStorage key for the override. Default `cc.sprites`. */
  storageKey?: string;
  /** Restrict the sizes used (the manifest lists which exist and which are pixel or smooth). */
  sizes?: { pixel?: readonly number[]; smooth?: readonly number[] };
}

export interface SpritePack {
  id: string;
  name: string;
  description: string;
  /** CSS theme, or 'inherit' to use the fallback style's. */
  theme: StyleTheme | 'inherit';
  /** Stylesheets (web fonts), or 'inherit'. */
  stylesheets?: string[] | 'inherit';
  /**
   * Interface CSS for this pack, so it can restyle panels, buttons and dialogs beyond the theme
   * variables (for example border-image frames from its ui/ sprites, and no hand-drawn look at all).
   * Applied while the style is active, on top of the fallback's own `css` unless `fallbackCss` is false.
   */
  css?: string;
  /**
   * CSS files with the same lifetime. Relative paths resolve against the sprite folder (so a pack
   * can ship `pack.css` next to its sprites, and `url()` inside it finds them); absolute URLs as given.
   */
  cssFiles?: string[];
  /** Whether the fallback style's own interface CSS still applies (default true). */
  fallbackCss?: boolean;
  source: SpriteSource;
  mapping: SpriteMapping;
  rules: DrawRules;
  /**
   * Layers that stay procedural even with sprites. Rivers, the coastline's ink, fog, captions,
   * pennants, routes and badges always come from the fallback.
   */
  procedural?: readonly PackLayer[];
}

/** The id scheme of docs/SPRITE_PROMPTS.md section 5 and tools/sprite-pipeline. */
export const DEFAULT_MAPPING: SpriteMapping = {
  units: {
    plain: 'units/{type}__none',
    // An expert's own role variant, else a free colonist in that role: the role always shows.
    role: ['units/{type}__{role}', 'units/free-colonist__{role}'],
  },
  terrain: {
    base: 'terrain/{terrain}',
    plowed: 'terrain/{terrain}__plowed',
    underLand: 'terrain/ocean',
  },
  relief: {
    forest: 'decor/forest__{terrain}',
    hills: 'decor/hills',
    mountains: 'decor/mountains',
  },
  bonus: {
    forest: 'decor/bonus__game',
    terrain: {
      ocean: 'decor/bonus__fish',
      plains: 'decor/bonus__wheat',
      desert: 'decor/bonus__oasis',
      grassland: 'decor/bonus__tobacco',
      prairie: 'decor/bonus__cotton',
      savannah: 'decor/bonus__sugar',
      swamp: 'decor/bonus__sugar',
      marsh: 'decor/bonus__ore',
      tundra: 'decor/bonus__ore',
      hills: 'decor/bonus__ore',
      mountains: 'decor/bonus__silver',
    },
  },
  rumour: 'decor/ruins',
  roads: { hub: 'decor/road__hub', spoke: 'decor/road__spoke', diagonal: 'decor/road__spoke-diagonal' },
  coast: { edge: 'terrain/coast__edge', inner: 'terrain/coast__inner', outer: 'terrain/coast__outer' },
  colonies: {
    // The house-count thresholds of the procedural colony.
    sizes: [
      { min: 0, id: 'colonies/colony__small' },
      { min: 4, id: 'colonies/colony__medium' },
      { min: 8, id: 'colonies/colony__large' },
    ],
    defences: { 1: 'colonies/stockade', 2: 'colonies/fort' },
  },
  settlements: {
    camp: 'settlements/{tribe}',
    capital: ['settlements/{tribe}__capital', 'settlements/{tribe}'],
  },
  buildings: 'buildings/{building}__{level}',
  goods: 'goods/{product}',
  overlays: { pennant: 'overlays/pennant', flag: 'overlays/flag', mission: 'overlays/mission' },
};

export const DEFAULT_RULES: DrawRules = {
  unit: { scale: 1.08, dy: 0.02 },
  forest: { scale: 1, x: 0.5, y: 0.95 },
  hills: { scale: 0.96, x: 0.5, y: 0.9 },
  mountains: { scale: 1.08, x: 0.5, y: 0.94 },
  rumour: { scale: 0.8, x: 0.5, y: 0.88 },
  bonus: { size: 0.44, x: 0.54, y: 0.02 },
  settlement: { scale: 1.08, x: 0.5, y: 0.98 },
  mission: { size: 0.42, x: 0.6, y: 0.48 },
  colony: { scale: 1.25, x: 0.5, y: 0.95 },
  defence: { scale: 1.5, x: 0.5, y: 1.02 },
  colonyFlag: { x: 0.42, y: 0.56, height: 0.5 },
  unitIcon: { scale: 0.98, pennant: { size: 0.36, minIcon: 28 } },
};

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> | null } : T;

export type PackOverrides = Partial<Omit<SpritePack, 'mapping' | 'rules' | 'source'>> & {
  mapping?: DeepPartial<SpriteMapping>;
  rules?: DeepPartial<DrawRules>;
  source?: Partial<SpriteSource>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge for packs: objects merge key by key, anything else (lists, strings, null) replaces. */
export function mergeDeep<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = mergeDeep((base as Record<string, unknown>)[k], v);
  return out as T;
}

/**
 * A pack built on another: same art and rules, with some ids, rules or settings changed. This is
 * how a scenario brings its own pieces, e.g. Australia-specific units over the standard pack:
 *
 *   extendPack(ligneClairePaintedPack, {
 *     id: 'ligne-claire-painted-australia', name: 'Ligne claire (painted, Australia)',
 *     mapping: { terrain: { types: { savannah: ['terrain/outback', 'terrain/savannah'] } } },
 *   })
 */
export function extendPack(base: SpritePack, over: PackOverrides): SpritePack {
  return mergeDeep(base, over);
}

/** A pack with every mapping slot and rule filled in from the defaults. */
export function completePack(pack: Partial<SpritePack> & Pick<SpritePack, 'id' | 'name' | 'description' | 'source'>): SpritePack {
  return {
    theme: 'inherit',
    stylesheets: 'inherit',
    ...pack,
    mapping: mergeDeep(DEFAULT_MAPPING, pack.mapping),
    rules: mergeDeep(DEFAULT_RULES, pack.rules),
  };
}
