/**
 * Optional feature-usage counters. The engine reports what each nation does (commands carried
 * out, buildings finished, roads laid, ships bought, ...) to a sink that tools such as the
 * arena install while they run. With no sink installed every call is a single null check, and
 * nothing here ever touches the game state, so the engine stays deterministic.
 */

/** Receives one count for a nation. */
export type FeatureSink = (nation: string, feature: string, n: number) => void;

let sink: FeatureSink | null = null;

/** Installs a sink (or removes it with null) and returns the previous one. */
export function setFeatureSink(next: FeatureSink | null): FeatureSink | null {
  const prev = sink;
  sink = next;
  return prev;
}

/** Whether anyone is listening; lets callers skip work needed only to build a feature name. */
export function tracking(): boolean {
  return sink !== null;
}

/** Counts one use of a feature by a nation. */
export function track(nation: string, feature: string, n = 1): void {
  if (sink) sink(nation, feature, n);
}
