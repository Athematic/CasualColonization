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

/** Thrown by deserialize for a save in a format this version cannot read. */
export class SaveVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveVersionError';
  }
}
