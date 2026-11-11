// Colony reports kept for the rest of a computer player's turn. The AI reads a colony's report
// many times a turn (choosing jobs, the build plan, carting, overflow, hurrying), and between
// those reads the colony rarely changes. A kept report is used only while everything it was
// worked out from is the same: the same turn and nation moving, the same workers in the same jobs
// (a unit's location is replaced, never changed in place, so identity shows a new job), the same
// goods in store, buildings, liberty, tax, Founding Fathers, independence and events. Tiles change
// only at the start of a turn (pioneer work), before the AI moves. The cache lives beside the
// state (a WeakMap keyed on the colony), so saves and hashes are unchanged.
import { colonyWorkers } from '../queries.js';
import { colonyReport, type ColonyReport } from '../production.js';
import type { Colony, GameState, Unit } from '../types.js';

interface Kept {
  turn: number;
  current: number;
  units: Unit[];
  locs: Unit['loc'][];
  goods: number[];
  buildings: number[];
  liberty: number;
  tax: number;
  fathers: number;
  independence: unknown;
  mods: number;
  report: ColonyReport;
}

const kept = new WeakMap<Colony, Kept>();

function sameNumbers(record: Record<string, number>, values: number[]): boolean {
  let i = 0;
  for (const k in record) if (record[k] !== values[i++]) return false;
  return i === values.length;
}

function numbers(record: Record<string, number>): number[] {
  const out: number[] = [];
  for (const k in record) out.push(record[k]);
  return out;
}

/** The colony's report (production.ts colonyReport), kept while nothing it depends on changes. Read only. */
export function aiColonyReport(s: GameState, c: Colony): ColonyReport {
  const p = s.players.find((o) => o.id === c.owner);
  const units = colonyWorkers(s, c);
  const k = kept.get(c);
  if (
    k &&
    k.turn === s.turn &&
    k.current === s.current &&
    k.units.length === units.length &&
    k.liberty === c.liberty &&
    k.tax === (p?.tax ?? 0) &&
    k.fathers === (p?.fathers.length ?? 0) &&
    k.independence === p?.independence &&
    k.mods === (s.events?.mods.length ?? 0) &&
    units.every((u, i) => u === k.units[i] && u.loc === k.locs[i]) &&
    sameNumbers(c.goods as Record<string, number>, k.goods) &&
    sameNumbers(c.buildings as Record<string, number>, k.buildings)
  ) {
    return k.report;
  }
  const report = colonyReport(s, c);
  kept.set(c, {
    turn: s.turn,
    current: s.current,
    units,
    locs: units.map((u) => u.loc),
    goods: numbers(c.goods as Record<string, number>),
    buildings: numbers(c.buildings as Record<string, number>),
    liberty: c.liberty,
    tax: p?.tax ?? 0,
    fathers: p?.fathers.length ?? 0,
    independence: p?.independence,
    mods: s.events?.mods.length ?? 0,
    report,
  });
  return report;
}
