import { runCrown } from '../independence.js';
import { mechanicsOf } from '../scenarios/index.js';
import type { GameState, Player } from '../types.js';
import { readyToDeclare, runAdvanced } from './advanced.js';
import { setConfederationJudge } from '../confederation.js';
import { cooperationOf, LEVEL_COOPERATION } from '../alliances.js';
import { companyRules } from '../companies.js';
import { creativeProfile } from './creative.js';
import { runNaive } from './naive.js';
import { AI_PROFILES, COMPANY_PROFILE, type AiProfile } from './profiles.js';

// A computer nation proposes to declare independence together when ready itself, and answers by its
// readiness (confederation.ts), wanting a smaller margin over its Royal Expeditionary Force than alone.
setConfederationJudge((s, nation, together) => {
  const share = together ? LEVEL_COOPERATION[s.players.find((p) => p.id === nation)?.ai ?? 'naive'].together : 0;
  return readyToDeclare(s, nation, 1 - (1 - cooperationOf(s).confederationReadiness) * share);
});

/** Plays one turn for a computer-controlled nation at its level. */
export function runAi(s: GameState, p: Player): void {
  if (p.id === 'crown') return runCrown(s);
  // A chartered company plays its own simple profile (companies.ts).
  if (p.kind === 'company') return runAdvanced(s, p, companyProfile(s));
  const level = p.ai ?? 'naive';
  if (level === 'naive') return runNaive(s, p);
  const base = inScenario(s, AI_PROFILES[level]);
  runAdvanced(s, p, base.adaptive ? creativeProfile(s, p, base) : base);
}

/**
 * A company keeps this many times the dividend reserve (`CompanyRules.reserve`) before it spends:
 * spending down to the profile's own 300 gold left nothing above the reserve to pay out.
 */
export const COMPANY_KEEP = 1.5;

const companyProfiles = new Map<number, AiProfile>();

/** The company profile, keeping its treasury above the scenario's dividend reserve. */
function companyProfile(s: GameState): AiProfile {
  const reserve = Math.max(COMPANY_PROFILE.reserve, Math.round(companyRules(s).reserve * COMPANY_KEEP));
  let prof = companyProfiles.get(reserve);
  if (!prof) companyProfiles.set(reserve, (prof = { ...COMPANY_PROFILE, reserve }));
  return prof;
}

/**
 * The profile without the plans the scenario's mechanics rule out: no independence plan without
 * independence, no missions without missions. With everything on (the Americas) it is the profile
 * itself.
 */
export function inScenario(s: GameState, prof: AiProfile): AiProfile {
  const m = mechanicsOf(s);
  if (m.independence && m.missions) return prof;
  return { ...prof, ...(m.independence ? {} : { independence: null }), ...(m.missions ? {} : { missions: false }) };
}
