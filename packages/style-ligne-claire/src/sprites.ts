import type { GoodId, NationId, ProductId, RoleId, TribeId, UnitTypeId } from '@cc/engine';
import { NATIONS, TRIBES, UNIT_TYPES } from '@cc/engine';
import { HULL, INK, ROOF, SAIL, SKIN, STONE, TRUNK, WALL, WHITE, WOOD, shade, type TreeShape } from './palette.js';

type Ctx = CanvasRenderingContext2D;

/** Fills then outlines the current path with the even ligne-claire stroke. */
export function inked(ctx: Ctx, fill: string | null, lw: number, path: () => void): void {
  ctx.beginPath();
  path();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function line(ctx: Ctx, lw: number, color: string, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Ink casing first, colour on top, keeps the uniform outline.
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw * 2.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
}

// ---- Landscape ----

export function tree(ctx: Ctx, x: number, y: number, r: number, color: string, shape: TreeShape, lw: number): void {
  if (shape === 'conifer') {
    inked(ctx, TRUNK, lw, () => ctx.rect(x - r * 0.12, y + r * 0.55, r * 0.24, r * 0.45));
    inked(ctx, color, lw, () => {
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 0.62, y - r * 0.1);
      ctx.lineTo(x + r * 0.32, y - r * 0.1);
      ctx.lineTo(x + r * 0.8, y + r * 0.6);
      ctx.lineTo(x - r * 0.8, y + r * 0.6);
      ctx.lineTo(x - r * 0.32, y - r * 0.1);
      ctx.lineTo(x - r * 0.62, y - r * 0.1);
      ctx.closePath();
    });
    return;
  }
  if (shape === 'palm') {
    inked(ctx, null, lw, () => {
      ctx.moveTo(x, y + r);
      ctx.quadraticCurveTo(x + r * 0.15, y, x - r * 0.05, y - r * 0.55);
    });
    for (const a of [-2.6, -1.9, -1.2, -0.5]) {
      inked(ctx, color, lw, () => {
        const ex = x + Math.cos(a) * r * 0.95;
        const ey = y - r * 0.55 + Math.sin(a) * r * 0.55 + r * 0.25;
        ctx.moveTo(x - r * 0.05, y - r * 0.55);
        ctx.quadraticCurveTo((x + ex) / 2, y - r * 1.05, ex, ey);
        ctx.quadraticCurveTo((x + ex) / 2, y - r * 0.6, x - r * 0.05, y - r * 0.55);
      });
    }
    return;
  }
  if (shape === 'bush') {
    inked(ctx, color, lw, () => {
      ctx.ellipse(x, y + r * 0.35, r * 0.75, r * 0.5, 0, Math.PI, 0);
      ctx.closePath();
    });
    return;
  }
  inked(ctx, TRUNK, lw, () => ctx.rect(x - r * 0.13, y + r * 0.2, r * 0.26, r * 0.8));
  inked(ctx, color, lw, () => ctx.arc(x, y - r * 0.2, r * 0.68, 0, Math.PI * 2));
}

export function hills(ctx: Ctx, x: number, y: number, s: number, color: string, lw: number): void {
  const base = y + s * 0.3;
  inked(ctx, shade(color, -0.08), lw, () => {
    ctx.moveTo(x - s * 0.44, base);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.32, x + s * 0.06, base);
    ctx.closePath();
  });
  inked(ctx, shade(color, -0.15), lw, () => {
    ctx.moveTo(x - s * 0.08, base);
    ctx.quadraticCurveTo(x + s * 0.18, y - s * 0.18, x + s * 0.44, base);
    ctx.closePath();
  });
}

export function mountains(ctx: Ctx, x: number, y: number, s: number, color: string, lw: number): void {
  const peak = (px: number, h: number, w: number, fill: string) => {
    const base = y + s * 0.34;
    const top = base - h;
    inked(ctx, fill, lw, () => {
      ctx.moveTo(px - w, base);
      ctx.lineTo(px, top);
      ctx.lineTo(px + w, base);
      ctx.closePath();
    });
    inked(ctx, WHITE, lw, () => {
      const k = 0.32;
      ctx.moveTo(px - w * k, top + h * k);
      ctx.lineTo(px, top);
      ctx.lineTo(px + w * k, top + h * k);
      ctx.lineTo(px + w * k * 0.4, top + h * k * 0.75);
      ctx.lineTo(px, top + h * k * 1.05);
      ctx.lineTo(px - w * k * 0.4, top + h * k * 0.75);
      ctx.closePath();
    });
  };
  peak(x + s * 0.16, s * 0.5, s * 0.28, shade(color, -0.18));
  peak(x - s * 0.12, s * 0.66, s * 0.32, shade(color, -0.06));
}

export function ruins(ctx: Ctx, x: number, y: number, s: number, lw: number): void {
  inked(ctx, STONE, lw, () => ctx.rect(x - s * 0.22, y - s * 0.12, s * 0.12, s * 0.34));
  inked(ctx, STONE, lw, () => ctx.rect(x + s * 0.08, y - s * 0.02, s * 0.12, s * 0.24));
  inked(ctx, STONE, lw, () => ctx.rect(x - s * 0.26, y + s * 0.22, s * 0.52, s * 0.07));
  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.round(s * 0.3)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x + s * 0.14, y - s * 0.22);
}

export const FONT = "'Comic Neue', 'Trebuchet MS', 'Segoe UI', sans-serif";

// ---- Colonies and settlements ----

function house(ctx: Ctx, x: number, y: number, w: number, lw: number, roof = ROOF): void {
  const h = w * 0.7;
  inked(ctx, WALL, lw, () => ctx.rect(x - w / 2, y - h, w, h));
  inked(ctx, roof, lw, () => {
    ctx.moveTo(x - w * 0.62, y - h);
    ctx.lineTo(x, y - h - w * 0.55);
    ctx.lineTo(x + w * 0.62, y - h);
    ctx.closePath();
  });
  inked(ctx, WOOD, lw * 0.8, () => ctx.rect(x - w * 0.12, y - h * 0.55, w * 0.24, h * 0.55));
}

export function flag(ctx: Ctx, x: number, y: number, h: number, color: string, lw: number): void {
  inked(ctx, null, lw, () => {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
  });
  inked(ctx, color, lw, () => {
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h * 0.6, y - h * 0.86);
    ctx.lineTo(x, y - h * 0.68);
    ctx.closePath();
  });
}

export function colonySprite(ctx: Ctx, x: number, y: number, s: number, nation: NationId, size: number, stockade: number, lw: number): void {
  const base = y + s * 0.3;
  if (stockade > 0) {
    // Palisade behind the houses.
    for (let i = -4; i <= 4; i++) {
      inked(ctx, stockade > 1 ? STONE : WOOD, lw * 0.8, () => {
        const px = x + i * s * 0.1;
        ctx.moveTo(px - s * 0.04, base);
        ctx.lineTo(px - s * 0.04, base - s * 0.42);
        ctx.lineTo(px, base - s * 0.5);
        ctx.lineTo(px + s * 0.04, base - s * 0.42);
        ctx.lineTo(px + s * 0.04, base);
        ctx.closePath();
      });
    }
  }
  flag(ctx, x + s * 0.1, base - s * 0.3, s * 0.5, NATIONS[nation].color, lw);
  const count = size >= 8 ? 4 : size >= 4 ? 3 : 2;
  const spots: [number, number, number][] = [
    [-0.2, -0.08, 0.3],
    [0.22, -0.02, 0.28],
    [0, 0.08, 0.32],
    [-0.3, 0.1, 0.24],
  ];
  const order = spots.slice(0, count).sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, w] of order) house(ctx, x + dx * s, base + dy * s - s * 0.06, w * s, lw);
}

export function settlementSprite(ctx: Ctx, x: number, y: number, s: number, tribe: TribeId, capital: boolean, lw: number): void {
  const def = TRIBES[tribe];
  const base = y + s * 0.3;
  if (def.settlement === 'camp') {
    const tipi = (tx: number, w: number) => {
      inked(ctx, '#ecd7a6', lw, () => {
        ctx.moveTo(tx - w / 2, base);
        ctx.lineTo(tx, base - w * 1.15);
        ctx.lineTo(tx + w / 2, base);
        ctx.closePath();
      });
      inked(ctx, def.color, lw * 0.7, () => {
        ctx.moveTo(tx - w * 0.33, base - w * 0.35);
        ctx.lineTo(tx + w * 0.33, base - w * 0.35);
      });
      inked(ctx, null, lw, () => {
        ctx.moveTo(tx - w * 0.12, base - w * 1.3);
        ctx.lineTo(tx, base - w * 1.15);
        ctx.lineTo(tx + w * 0.12, base - w * 1.3);
      });
    };
    tipi(x - s * 0.18, s * 0.34);
    tipi(x + s * 0.17, s * 0.3);
    tipi(x, s * 0.38);
  } else if (def.settlement === 'village') {
    const hut = (hx: number, w: number) => {
      inked(ctx, '#c99a5b', lw, () => {
        ctx.ellipse(hx, base, w / 2, w * 0.55, 0, Math.PI, 0);
        ctx.closePath();
      });
      inked(ctx, def.color, lw * 0.8, () => ctx.rect(hx - w * 0.1, base - w * 0.25, w * 0.2, w * 0.25));
    };
    hut(x - s * 0.2, s * 0.32);
    hut(x + s * 0.2, s * 0.3);
    hut(x, s * 0.4);
  } else {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const w = s * (0.8 - i * 0.16);
      const h = s * 0.12;
      inked(ctx, i === steps - 1 ? def.color : '#e0cfa4', lw, () => ctx.rect(x - w / 2, base - (i + 1) * h, w, h));
    }
  }
  if (capital) flag(ctx, x + s * 0.3, base, s * 0.55, def.color, lw);
}

// ---- Units ----

const COATS: Partial<Record<UnitTypeId, string>> = {
  freeColonist: '#7c6a4f',
  indenturedServant: '#9a8c74',
  pettyCriminal: '#8d8d86',
  expertFarmer: '#5e9c3d',
  expertFisherman: '#3f7ca8',
  expertFurTrapper: '#8a5a32',
  expertSilverMiner: '#9aa3ad',
  expertLumberjack: '#b0402c',
  expertOreMiner: '#6a6a6a',
  masterSugarPlanter: '#e8e0c8',
  masterCottonPlanter: '#f2efe6',
  masterTobaccoPlanter: '#a2733d',
  masterCarpenter: '#c08a3e',
  masterBlacksmith: '#3f3f3f',
  masterGunsmith: '#4e5a3a',
  masterDistiller: '#7a3e22',
  masterTobacconist: '#6b4a2a',
  masterWeaver: '#b33b6a',
  masterFurTrader: '#6c4a32',
  elderStatesman: '#2c3f7a',
  firebrandPreacher: '#2a2a2a',
  hardyPioneer: '#9a6a3a',
  seasonedScout: '#8f6b3b',
  veteranSoldier: '#5b5b5b',
};

function horse(ctx: Ctx, x: number, y: number, s: number, lw: number): void {
  const c = '#9b6a3e';
  for (const lx of [-0.24, -0.12, 0.12, 0.24]) {
    inked(ctx, null, lw, () => {
      ctx.moveTo(x + lx * s, y + s * 0.12);
      ctx.lineTo(x + lx * s, y + s * 0.38);
    });
  }
  inked(ctx, c, lw, () => ctx.ellipse(x, y + s * 0.08, s * 0.32, s * 0.15, 0, 0, Math.PI * 2));
  inked(ctx, c, lw, () => {
    ctx.moveTo(x + s * 0.24, y + s * 0.02);
    ctx.lineTo(x + s * 0.36, y - s * 0.22);
    ctx.lineTo(x + s * 0.48, y - s * 0.16);
    ctx.lineTo(x + s * 0.34, y + s * 0.08);
    ctx.closePath();
  });
}

function person(ctx: Ctx, x: number, y: number, s: number, coat: string, hat: 'brim' | 'tricorn' | 'none', lw: number): void {
  inked(ctx, coat, lw, () => {
    ctx.moveTo(x - s * 0.14, y - s * 0.02);
    ctx.lineTo(x + s * 0.14, y - s * 0.02);
    ctx.lineTo(x + s * 0.2, y + s * 0.34);
    ctx.lineTo(x - s * 0.2, y + s * 0.34);
    ctx.closePath();
  });
  inked(ctx, SKIN, lw, () => ctx.arc(x, y - s * 0.15, s * 0.11, 0, Math.PI * 2));
  if (hat === 'brim') {
    inked(ctx, '#4a3a28', lw, () => {
      ctx.ellipse(x, y - s * 0.24, s * 0.17, s * 0.04, 0, 0, Math.PI * 2);
    });
    inked(ctx, '#4a3a28', lw, () => ctx.rect(x - s * 0.08, y - s * 0.34, s * 0.16, s * 0.1));
  } else if (hat === 'tricorn') {
    inked(ctx, INK, lw, () => {
      ctx.moveTo(x - s * 0.17, y - s * 0.22);
      ctx.lineTo(x, y - s * 0.34);
      ctx.lineTo(x + s * 0.17, y - s * 0.22);
      ctx.closePath();
    });
  }
}

function ship(ctx: Ctx, x: number, y: number, s: number, type: UnitTypeId, nation: NationId, lw: number): void {
  const masts = type === 'caravel' || type === 'privateer' ? 2 : type === 'merchantman' ? 2 : 3;
  const sail = type === 'privateer' ? '#5a5a5a' : SAIL;
  const hullW = type === 'galleon' || type === 'frigate' ? 0.4 : 0.34;
  const deck = y + s * 0.14;
  for (let i = 0; i < masts; i++) {
    const mx = x + (i / (masts - 1) - 0.5) * s * hullW * 1.1;
    const h = s * (i === Math.floor(masts / 2) ? 0.6 : 0.5);
    inked(ctx, null, lw, () => {
      ctx.moveTo(mx, deck);
      ctx.lineTo(mx, deck - h);
    });
    if (type === 'caravel') {
      inked(ctx, sail, lw, () => {
        ctx.moveTo(mx, deck - h);
        ctx.lineTo(mx + s * 0.16, deck - s * 0.08);
        ctx.lineTo(mx - s * 0.02, deck - s * 0.08);
        ctx.closePath();
      });
    } else {
      inked(ctx, sail, lw, () => {
        ctx.moveTo(mx - s * 0.11, deck - h * 0.92);
        ctx.quadraticCurveTo(mx, deck - h * 0.8, mx + s * 0.11, deck - h * 0.92);
        ctx.lineTo(mx + s * 0.1, deck - h * 0.25);
        ctx.quadraticCurveTo(mx, deck - h * 0.15, mx - s * 0.1, deck - h * 0.25);
        ctx.closePath();
      });
    }
    if (i === masts - 1) {
      inked(ctx, type === 'privateer' ? INK : NATIONS[nation].color, lw, () => {
        ctx.moveTo(mx, deck - h);
        ctx.lineTo(mx + s * 0.14, deck - h + s * 0.04);
        ctx.lineTo(mx, deck - h + s * 0.08);
        ctx.closePath();
      });
    }
  }
  inked(ctx, HULL, lw, () => {
    ctx.moveTo(x - s * hullW, deck);
    ctx.lineTo(x + s * hullW + s * 0.06, deck - s * 0.03);
    ctx.quadraticCurveTo(x + s * hullW * 0.8, deck + s * 0.18, x + s * 0.18, deck + s * 0.2);
    ctx.lineTo(x - s * 0.2, deck + s * 0.2);
    ctx.quadraticCurveTo(x - s * hullW, deck + s * 0.14, x - s * hullW, deck);
    ctx.closePath();
  });
  if (type === 'frigate' || type === 'galleon' || type === 'privateer') {
    for (let i = -2; i <= 2; i++) inked(ctx, INK, lw * 0.5, () => ctx.rect(x + i * s * 0.1 - s * 0.02, deck + s * 0.05, s * 0.04, s * 0.04));
  }
}

function wagon(ctx: Ctx, x: number, y: number, s: number, lw: number): void {
  inked(ctx, WALL, lw, () => {
    ctx.moveTo(x - s * 0.3, y);
    ctx.quadraticCurveTo(x, y - s * 0.42, x + s * 0.3, y);
    ctx.closePath();
  });
  inked(ctx, WOOD, lw, () => ctx.rect(x - s * 0.34, y, s * 0.68, s * 0.14));
  for (const wx of [-0.2, 0.2]) {
    inked(ctx, '#d8b27a', lw, () => ctx.arc(x + wx * s, y + s * 0.2, s * 0.11, 0, Math.PI * 2));
    inked(ctx, null, lw * 0.6, () => {
      ctx.moveTo(x + wx * s - s * 0.11, y + s * 0.2);
      ctx.lineTo(x + wx * s + s * 0.11, y + s * 0.2);
    });
  }
}

function cannon(ctx: Ctx, x: number, y: number, s: number, lw: number): void {
  ctx.save();
  ctx.translate(x, y + s * 0.02);
  ctx.rotate(-0.35);
  inked(ctx, '#55585c', lw, () => ctx.roundRect(-s * 0.32, -s * 0.07, s * 0.58, s * 0.14, s * 0.05));
  ctx.restore();
  inked(ctx, WOOD, lw, () => ctx.arc(x - s * 0.06, y + s * 0.16, s * 0.14, 0, Math.PI * 2));
  inked(ctx, null, lw * 0.7, () => ctx.arc(x - s * 0.06, y + s * 0.16, s * 0.03, 0, Math.PI * 2));
}

/** Draws a unit centred at (x, y) inside a box of size s. */
export function unitSprite(ctx: Ctx, x: number, y: number, s: number, type: UnitTypeId, role: RoleId, nation: NationId, lw: number): void {
  const def = UNIT_TYPES[type];
  if (def.kind === 'ship') return ship(ctx, x, y, s, type, nation, lw);
  if (def.kind === 'wagon') return wagon(ctx, x, y, s, lw);
  if (def.kind === 'artillery') return cannon(ctx, x, y, s, lw);
  const nationColor = NATIONS[nation].color;
  const mounted = role === 'dragoon' || role === 'scout';
  if (mounted) {
    horse(ctx, x, y + s * 0.02, s, lw);
    person(ctx, x - s * 0.04, y - s * 0.18, s * 0.78, role === 'dragoon' ? nationColor : COATS[type] ?? '#7c6a4f', role === 'dragoon' ? 'tricorn' : 'brim', lw);
    if (role === 'dragoon') {
      line(ctx, lw * 0.8, '#d9d9d9', [[x + s * 0.06, y - s * 0.08], [x + s * 0.2, y - s * 0.5]]);
    }
    return;
  }
  const coat = role === 'soldier' ? nationColor : COATS[type] ?? '#7c6a4f';
  person(ctx, x, y, s, coat, role === 'soldier' ? 'tricorn' : def.skill > 0 || type === 'freeColonist' ? 'brim' : 'none', lw);
  if (role === 'soldier') {
    line(ctx, lw * 0.8, WOOD, [[x + s * 0.24, y + s * 0.3], [x + s * 0.28, y - s * 0.34]]);
  } else if (role === 'pioneer') {
    line(ctx, lw * 0.8, WOOD, [[x - s * 0.3, y + s * 0.32], [x - s * 0.2, y - s * 0.22]]);
    inked(ctx, '#9aa0a6', lw, () => {
      ctx.moveTo(x - s * 0.34, y - s * 0.2);
      ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.34, x - s * 0.06, y - s * 0.2);
      ctx.closePath();
    });
  }
}

// ---- Goods ----

export function productIcon(ctx: Ctx, x: number, y: number, s: number, product: ProductId, lw: number): void {
  const r = s * 0.36;
  switch (product as GoodId | 'hammers' | 'bells' | 'crosses') {
    case 'food':
      inked(ctx, '#f2c43a', lw, () => ctx.ellipse(x, y, r * 0.45, r * 0.9, 0, 0, Math.PI * 2));
      inked(ctx, '#6aa84f', lw, () => {
        ctx.moveTo(x, y + r * 0.9);
        ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.2, x - r * 0.5, y - r * 0.5);
        ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.3, x, y + r * 0.9);
      });
      break;
    case 'sugar':
      inked(ctx, WHITE, lw, () => {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.6, y + r * 0.8);
        ctx.lineTo(x - r * 0.6, y + r * 0.8);
        ctx.closePath();
      });
      inked(ctx, '#3a6fb0', lw, () => ctx.rect(x - r * 0.6, y + r * 0.45, r * 1.2, r * 0.35));
      break;
    case 'tobacco':
      inked(ctx, '#9a8a3a', lw, () => {
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r);
        ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r);
      });
      inked(ctx, null, lw * 0.6, () => {
        ctx.moveTo(x, y - r * 0.8);
        ctx.lineTo(x, y + r * 0.9);
      });
      break;
    case 'cotton':
      for (const [dx, dy] of [[-0.4, 0.1], [0.4, 0.1], [0, -0.35], [0, 0.35]]) inked(ctx, WHITE, lw, () => ctx.arc(x + dx * r, y + dy * r, r * 0.45, 0, Math.PI * 2));
      break;
    case 'furs':
      inked(ctx, '#9b6a3e', lw, () => {
        ctx.moveTo(x - r * 0.5, y - r * 0.8);
        ctx.lineTo(x + r * 0.5, y - r * 0.8);
        ctx.lineTo(x + r * 0.9, y - r * 0.3);
        ctx.lineTo(x + r * 0.5, y + r * 0.2);
        ctx.lineTo(x + r * 0.4, y + r * 0.9);
        ctx.lineTo(x - r * 0.4, y + r * 0.9);
        ctx.lineTo(x - r * 0.5, y + r * 0.2);
        ctx.lineTo(x - r * 0.9, y - r * 0.3);
        ctx.closePath();
      });
      break;
    case 'lumber':
      for (const [dx, dy] of [[-0.45, 0.35], [0.45, 0.35], [0, -0.4]]) {
        inked(ctx, '#c8955a', lw, () => ctx.arc(x + dx * r, y + dy * r, r * 0.45, 0, Math.PI * 2));
        inked(ctx, null, lw * 0.5, () => ctx.arc(x + dx * r, y + dy * r, r * 0.18, 0, Math.PI * 2));
      }
      break;
    case 'ore':
      inked(ctx, '#8d8f94', lw, () => {
        ctx.moveTo(x - r * 0.9, y + r * 0.6);
        ctx.lineTo(x - r * 0.6, y - r * 0.4);
        ctx.lineTo(x, y - r * 0.8);
        ctx.lineTo(x + r * 0.8, y - r * 0.2);
        ctx.lineTo(x + r * 0.9, y + r * 0.6);
        ctx.closePath();
      });
      break;
    case 'silver':
      inked(ctx, '#dfe4ea', lw, () => {
        ctx.moveTo(x - r * 0.6, y - r * 0.4);
        ctx.lineTo(x + r * 0.6, y - r * 0.4);
        ctx.lineTo(x + r * 0.95, y + r * 0.5);
        ctx.lineTo(x - r * 0.95, y + r * 0.5);
        ctx.closePath();
      });
      break;
    case 'horses':
      ctx.save();
      ctx.translate(x - s * 0.06, y - s * 0.08);
      horse(ctx, 0, 0, s * 0.85, lw);
      ctx.restore();
      break;
    case 'rum':
      inked(ctx, '#a2683a', lw, () => ctx.ellipse(x, y, r * 0.7, r * 0.95, 0, 0, Math.PI * 2));
      for (const dy of [-0.45, 0.45]) inked(ctx, null, lw, () => {
        ctx.moveTo(x - r * 0.62, y + dy * r);
        ctx.lineTo(x + r * 0.62, y + dy * r);
      });
      break;
    case 'cigars':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      inked(ctx, '#7a4a28', lw, () => ctx.roundRect(-r, -r * 0.22, r * 2, r * 0.44, r * 0.2));
      inked(ctx, '#d23c2a', lw * 0.7, () => ctx.rect(r * 0.2, -r * 0.22, r * 0.3, r * 0.44));
      ctx.restore();
      break;
    case 'cloth':
      inked(ctx, '#c8384a', lw, () => ctx.rect(x - r * 0.8, y - r * 0.5, r * 1.6, r));
      inked(ctx, '#e8a0aa', lw, () => ctx.ellipse(x + r * 0.8, y, r * 0.25, r * 0.5, 0, 0, Math.PI * 2));
      break;
    case 'coats':
      inked(ctx, '#3a5a9a', lw, () => {
        ctx.moveTo(x - r * 0.3, y - r * 0.9);
        ctx.lineTo(x + r * 0.3, y - r * 0.9);
        ctx.lineTo(x + r * 0.9, y - r * 0.4);
        ctx.lineTo(x + r * 0.7, y + r * 0.9);
        ctx.lineTo(x - r * 0.7, y + r * 0.9);
        ctx.lineTo(x - r * 0.9, y - r * 0.4);
        ctx.closePath();
      });
      inked(ctx, null, lw * 0.7, () => {
        ctx.moveTo(x, y - r * 0.9);
        ctx.lineTo(x, y + r * 0.9);
      });
      break;
    case 'tradeGoods':
      inked(ctx, '#c8955a', lw, () => ctx.rect(x - r * 0.8, y - r * 0.7, r * 1.6, r * 1.4));
      inked(ctx, null, lw * 0.7, () => {
        ctx.moveTo(x - r * 0.8, y - r * 0.7);
        ctx.lineTo(x + r * 0.8, y + r * 0.7);
        ctx.moveTo(x + r * 0.8, y - r * 0.7);
        ctx.lineTo(x - r * 0.8, y + r * 0.7);
      });
      break;
    case 'tools':
    case 'hammers':
      line(ctx, lw * 0.8, WOOD, [[x - r * 0.6, y + r * 0.8], [x + r * 0.3, y - r * 0.3]]);
      ctx.save();
      ctx.translate(x + r * 0.35, y - r * 0.35);
      ctx.rotate(Math.PI / 4);
      inked(ctx, product === 'tools' ? '#9aa0a6' : '#7a7f86', lw, () => ctx.rect(-r * 0.55, -r * 0.22, r * 1.1, r * 0.44));
      ctx.restore();
      break;
    case 'muskets':
      line(ctx, lw * 0.8, '#7a7f86', [[x - r * 0.9, y + r * 0.6], [x + r * 0.9, y - r * 0.6]]);
      inked(ctx, WOOD, lw, () => {
        ctx.moveTo(x - r * 0.95, y + r * 0.4);
        ctx.lineTo(x - r * 0.3, y + r * 0.05);
        ctx.lineTo(x - r * 0.2, y + r * 0.3);
        ctx.lineTo(x - r * 0.75, y + r * 0.85);
        ctx.closePath();
      });
      break;
    case 'bells':
      inked(ctx, '#e8b830', lw, () => {
        ctx.moveTo(x - r * 0.8, y + r * 0.6);
        ctx.quadraticCurveTo(x - r * 0.6, y - r, x, y - r);
        ctx.quadraticCurveTo(x + r * 0.6, y - r, x + r * 0.8, y + r * 0.6);
        ctx.closePath();
      });
      inked(ctx, '#e8b830', lw, () => ctx.arc(x, y + r * 0.75, r * 0.18, 0, Math.PI * 2));
      break;
    case 'crosses':
      inked(ctx, WHITE, lw, () => {
        const t = r * 0.25;
        ctx.moveTo(x - t, y - r);
        ctx.lineTo(x + t, y - r);
        ctx.lineTo(x + t, y - r * 0.4);
        ctx.lineTo(x + r * 0.65, y - r * 0.4);
        ctx.lineTo(x + r * 0.65, y + r * 0.05);
        ctx.lineTo(x + t, y + r * 0.05);
        ctx.lineTo(x + t, y + r);
        ctx.lineTo(x - t, y + r);
        ctx.lineTo(x - t, y + r * 0.05);
        ctx.lineTo(x - r * 0.65, y + r * 0.05);
        ctx.lineTo(x - r * 0.65, y - r * 0.4);
        ctx.lineTo(x - t, y - r * 0.4);
        ctx.closePath();
      });
      break;
  }
}

export { house };
