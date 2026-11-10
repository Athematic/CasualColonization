/**
 * The Continental Congress hall: where each father stands (a pure layout, shared by the screen and its
 * tests) and a procedural backdrop for styles without hall art.
 *
 * Coordinates are shares of the hall frame (x and y in 0..1 of its width and height; the frame is
 * CONGRESS_HALL_ASPECT wide). A father's image is a 2:3 figure whose feet stand FATHER_FEET of the way
 * down it, so `feetY` is the floor line and `h` the image height as a share of the frame height.
 */
/** Width of a father figure's image as a share of its height. */
export const FATHER_FIGURE_ASPECT = 2 / 3;
/** Where the feet stand, as a share of the figure image's height. */
export const FATHER_FEET = 0.92;

/** Width over height of the hall frame (the `ui/congress-hall` sprite is 1536x1024). */
export const CONGRESS_HALL_ASPECT = 1.5;

export interface HallRow {
  /** Floor line of the row, as a share of the frame height. */
  feetY: number;
  /** Figure image height as a share of the frame height. */
  h: number;
}

/** Front standing row, a second row on the raised step, and a third behind that (each a little smaller). */
export const HALL_ROWS: readonly HallRow[] = [
  { feetY: 0.95, h: 0.44 },
  { feetY: 0.8, h: 0.39 },
  { feetY: 0.67, h: 0.34 },
];

/** A figure's body is about this share of its image width (the rest is air around it). */
export const HALL_BODY = 0.5;
/** Neighbours' bodies may overlap by this share of a body width. */
export const HALL_OVERLAP = 0.08;

export interface HallSpot {
  /** Index in join order. */
  index: number;
  row: number;
  /** Horizontal centre, share of the frame width. */
  x: number;
  feetY: number;
  /** Image height, share of the frame height. */
  h: number;
  /** Image width, share of the frame width. */
  w: number;
}

/** Body width of a row's figures as a share of the frame width. */
export function hallBodyWidth(row: number): number {
  const r = HALL_ROWS[row]!;
  return (r.h * FATHER_FIGURE_ASPECT * HALL_BODY) / CONGRESS_HALL_ASPECT;
}

/** How many figures fit in a row without their bodies overlapping. */
export function hallRowCapacity(row: number): number {
  return Math.floor((1 - hallBodyWidth(row) / HALL_BODY) / (hallBodyWidth(row) * (1 - HALL_OVERLAP))) + 1;
}

/**
 * Spots for `count` figures in join order: the first fill the front row from the left, then the next row, then the
 * third. With several rows the fathers are shared out (front rows a little fuller) so the hall looks balanced. Rows
 * are centred; rows behind are shifted half a step so their figures stand between those in front.
 */
export function layoutCongressHall(count: number): HallSpot[] {
  if (count <= 0) return [];
  const caps = HALL_ROWS.map((_, i) => hallRowCapacity(i));
  let rows = 1;
  let room = caps[0]!;
  while (room < count && rows < HALL_ROWS.length) room += caps[rows++]!;
  const sizes: number[] = [];
  let rest = count;
  for (let r = 0; r < rows; r++) {
    const n = r === rows - 1 ? rest : Math.min(caps[r]!, Math.ceil(rest / (rows - r)));
    sizes.push(n);
    rest -= n;
  }
  const out: HallSpot[] = [];
  let index = 0;
  for (let r = 0; r < rows; r++) {
    const row = HALL_ROWS[r]!;
    const n = sizes[r]!;
    const body = hallBodyWidth(r);
    // Whole images stay inside the frame: the centres range over the width less one image.
    const avail = 1 - body / HALL_BODY;
    // Airy where there is room, never tighter than the overlap allows.
    const step = n > 1 ? Math.min(body * 1.45, avail / (n - 1)) : 0;
    const span = step * (n - 1);
    // Rows behind hang half a step off the row in front, as far as the frame allows.
    const shift = r % 2 === 1 ? Math.min(step / 2, (avail - span) / 2) : 0;
    for (let i = 0; i < n; i++) {
      out.push({ index: index++, row: r, x: 0.5 - span / 2 + i * step + shift, feetY: row.feetY, h: row.h, w: (row.h * FATHER_FIGURE_ASPECT) / CONGRESS_HALL_ASPECT });
    }
  }
  return out;
}

/** The painting order: rows from the back to the front, each left to right. */
export function hallPaintOrder(spots: readonly HallSpot[]): HallSpot[] {
  return [...spots].sort((a, b) => a.feetY - b.feetY || a.x - b.x);
}

/** Top-left corner and size of a spot's image in frame pixels. */
export function hallSpotBox(spot: HallSpot, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const h = spot.h * height;
  const w = h * FATHER_FIGURE_ASPECT;
  return { x: spot.x * width - w / 2, y: spot.feetY * height - FATHER_FEET * h, w, h };
}

/**
 * A flat ligne claire assembly hall filling width×height: panelled wall, tall windows, a raised dais with a lectern
 * at the back, a planked floor, a step for the second row and benches at the sides.
 */
export function drawCongressHallBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, ink: string): void {
  const W = width;
  const H = height;
  const lw = Math.max(1.2, H * 0.003);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  const box = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  };
  // Back wall with wainscot panelling.
  const floorTop = 0.44 * H;
  box(0, 0, W, floorTop, '#e7dcc3');
  box(0, 0.28 * H, W, 0.16 * H, '#b98f5e');
  for (let x = 0.02 * W; x < W; x += 0.09 * W) ctx.strokeRect(x, 0.3 * H, 0.07 * W, 0.12 * H);
  box(0, 0, W, 0.035 * H, '#d3c19a');
  // Tall arched windows.
  const wins = 5;
  for (let i = 0; i < wins; i++) {
    const cx = ((i + 0.5) / wins) * W;
    if (Math.abs(cx - W / 2) < 0.12 * W) continue;
    const ww = 0.06 * W;
    const top = 0.07 * H;
    ctx.fillStyle = '#bfe0ef';
    ctx.beginPath();
    ctx.moveTo(cx - ww / 2, 0.26 * H);
    ctx.lineTo(cx - ww / 2, top + ww / 2);
    ctx.arc(cx, top + ww / 2, ww / 2, Math.PI, 0);
    ctx.lineTo(cx + ww / 2, 0.26 * H);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, 0.26 * H);
    ctx.moveTo(cx - ww / 2, 0.16 * H);
    ctx.lineTo(cx + ww / 2, 0.16 * H);
    ctx.stroke();
  }
  // Central arch with a banner.
  ctx.fillStyle = '#f4efe0';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 0.1 * W, 0.28 * H);
  ctx.lineTo(W / 2 - 0.1 * W, 0.12 * H);
  ctx.arc(W / 2, 0.12 * H, 0.1 * W, Math.PI, 0);
  ctx.lineTo(W / 2 + 0.1 * W, 0.28 * H);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b3402f';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 0.05 * W, 0.06 * H);
  ctx.lineTo(W / 2 + 0.05 * W, 0.06 * H);
  ctx.lineTo(W / 2 + 0.05 * W, 0.22 * H);
  ctx.lineTo(W / 2, 0.19 * H);
  ctx.lineTo(W / 2 - 0.05 * W, 0.22 * H);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Planked floor with perspective lines.
  box(0, floorTop, W, H - floorTop, '#d9b27c');
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) {
    ctx.moveTo(W / 2 + i * 0.03 * W, floorTop);
    ctx.lineTo(W / 2 + i * 0.16 * W, H);
  }
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // The dais at the back, with steps and a lectern.
  box(0.3 * W, 0.36 * H, 0.4 * W, 0.08 * H, '#a8794a');
  box(0.26 * W, 0.42 * H, 0.48 * W, 0.04 * H, '#c2915a');
  box(0.22 * W, 0.45 * H, 0.56 * W, 0.03 * H, '#d3a46c');
  box(W / 2 - 0.04 * W, 0.28 * H, 0.08 * W, 0.09 * H, '#8c5f38');
  box(W / 2 - 0.05 * W, 0.275 * H, 0.1 * W, 0.02 * H, '#b98f5e');
  // The raised step for the second row.
  box(0, 0.8 * H, W, 0.03 * H, '#c2915a');
  box(0, 0.83 * H, W, 0.02 * H, '#a8794a');
  // Benches at the sides, out of the standing area's way.
  for (const side of [0, 1]) {
    const x0 = side ? 0.93 * W : 0;
    for (let i = 0; i < 3; i++) box(x0, (0.52 + i * 0.06) * H, 0.07 * W, 0.022 * H, '#8c5f38');
  }
  ctx.restore();
}
