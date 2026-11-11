// TEMPORARY (Beta 3 step 9 tuning): experiment knobs read from the environment. Removed before the step ends.
const env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
export function knob(name: string, fallback: number): number {
  const v = env[name];
  return v === undefined || v === '' ? fallback : Number(v);
}
export function flag(name: string, letter: string): boolean {
  return !!env[name]?.includes(letter);
}
