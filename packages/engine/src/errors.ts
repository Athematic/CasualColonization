/** Thrown when a command breaks the rules; the message is shown to the player. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function fail(message: string): never {
  throw new RuleError(message);
}
