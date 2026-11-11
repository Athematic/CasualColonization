/**
 * A scenario's terms (docs/design/scenario-framework.md, section 3.13): the words that differ
 * between settings ("Europe", "the New World", "Continental Congress", "the King") and a few whole
 * templates (the arrival message, the rumours' outcomes, the end of the game). Engine messages and
 * the web game read them with `term(s, key, vars)`.
 *
 * Templates use `{name}` placeholders, filled from `vars` first and then from the scenario's own
 * terms, so a template that says "{homeland}" follows the scenario's word for it. `{Name}` (first
 * letter capital) gives the same value with a capital first letter, for the start of a sentence.
 *
 * The Americas' terms are today's exact strings: messages and history entries are part of the
 * saved state and the golden hashes, so every string built from them must stay byte-identical.
 * Full localisation (message ids, other languages) is a separate project (Q6).
 *
 * A leaf module: it imports nothing, so any module can use it.
 */

/** The Americas' terms; a scenario's `text` overrides any of them, and the rest stay these. */
export const AMERICAS_TEXT = {
  // ---- Words ----
  /** Where the nations come from and trade; the home ports lie there. */
  homeland: 'Europe',
  /** The adjective for the nations from the homeland ("European nations"). */
  homelandAdjective: 'European',
  /** The land being colonised, as in "has reached the New World". */
  colonyLand: 'the New World',
  /** The power the colonies answer to. */
  crown: 'the Crown',
  /** Its ruler, as in "the King demands". */
  king: 'the King',
  /** The ruler addressed with respect, as in "His Majesty raises the tax rate". */
  majesty: 'His Majesty',
  /** The force the Crown holds against a rebellion. */
  ref: 'Royal Expeditionary Force',
  /** The Crown's troops on the map. */
  royalTroops: 'Royal troops',
  /** The war a nation fights after declaring independence. */
  independenceWar: 'War of Independence',
  /** The rebels' army that veteran soldiers join on the declaration. */
  army: 'Continental Army',
  /** The council (the Americas: the Continental Congress). */
  council: 'Continental Congress',
  /** Its short name, as in "Congress: choose a Founding Father". */
  councilShort: 'Congress',
  /** A council member, and members. */
  member: 'Founding Father',
  members: 'Founding Fathers',
  /** Colonists loyal to the Crown, one and many. */
  loyalist: 'Tory',
  loyalists: 'Tories',
  /** A power from the homeland that is not in the game ("A European power intervenes"). */
  foreignPower: 'A European power',

  // ---- Templates ----
  /** The first message of a game, to each nation: {nation} and {heading}. */
  arrival: "Your Majesty's expedition for {nation} has reached {colonyLand}. Sail {heading} to find land!",
  /** To everyone else when a nation arrives later in the game (NationEntry.arrives): {nation}. */
  'arrival.news': 'Ships of {nation} have reached {colonyLand}.',

  /** Lost City Rumours (rumours.ts): messages, and the history entries of the notable ones. */
  'rumour.nothing': 'The rumour proves to be nothing more than tall tales.',
  'rumour.tales': 'You meet travellers who describe the lands around you.',
  'rumour.smallTreasure': 'You find a small trinket cache worth {gold} gold.',
  'rumour.colonist': 'You find survivors of a lost colony; they join you as free colonists.',
  'rumour.treasure': 'You discover the ruins of a lost civilisation and recover {gold} gold!',
  'rumour.treasure.history': 'Explorers find the ruins of a lost civilisation and recover {gold} gold.',
  'rumour.fountain': 'You have found the Fountain of Youth! Four new colonists wait on the docks in {homeland}.',
  'rumour.fountain.history': 'Explorers find the Fountain of Youth: four colonists come from {homeland}.',
  'rumour.lost': 'The expedition vanishes without a trace.',
  'rumour.burial': 'You have disturbed a {tribe} burial ground! The {tribe} swear eternal vengeance on {nation}.',
  'rumour.burial.history': '{adjective} explorers disturb a {tribe} burial ground; the {tribe} swear eternal war.',

  /** The end of the game (victory.ts, independence.ts): {year}, {nation}. */
  'gameOver.time': 'The year {year} has come and the age of colonization is over.',
  'gameOver.concord': 'The year {year} has come and the age of colonization is over. The alliance of {allies} holds the greater part of {colonyLand} and wins together.',
  'gameOver.prosperity': 'The year {year} has come and the age of colonization is over. In peace and partnership with {partners}, {winners} {win} by prosperity.',
  'gameOver.playOn': 'Every nation has fought its {independenceWar}.',
  'gameOver.won': '{nation} has won the {independenceWar}! A new nation is born.',
  'gameOver.lost': "The rebellion in {nation}'s colonies has been crushed.",

  // ---- The title screen (apps/web landing.ts) ----
  'landing.eyebrow': 'A game of the New World, 1492–1850',
  'landing.heading': 'Found colonies. Trade with Europe. Win your independence.',
  'landing.pitch':
    'Sail west, land your first colonists and build a nation: work the land, run the market, meet the native peoples, bring Founding Fathers into Congress, and decide when to break with the Crown. Play against up to seven nations, each led by a person or a computer.',
  'landing.maps': 'Generated worlds, or hand-made maps of the Americas',
  /** The New game screen's line under the title. */
  'newGame.tagline': 'Alpha 0.2: a clone of the classic game of colonising the New World.',
} as const;

export type TermKey = keyof typeof AMERICAS_TEXT;

/** A scenario's terms: the keys it changes (the rest are the Americas'). */
export type ScenarioText = Partial<Record<TermKey, string>>;

/** "the Netherlands" -> "The Netherlands". */
export function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Fills a template's `{name}` placeholders: from `vars`, else from `terms`; `{Name}` capitalises.
 * Placeholders that name nothing are left as they are.
 */
export function fillTemplate(template: string, terms: Readonly<Record<string, string>>, vars?: Readonly<Record<string, string | number>>): string {
  if (!template.includes('{')) return template;
  return template.replace(/\{(\w+)\}/g, (all, key: string) => {
    const lower = key[0].toLowerCase() + key.slice(1);
    const raw = vars?.[key] ?? terms[key] ?? (lower !== key ? (vars?.[lower] ?? terms[lower]) : undefined);
    if (raw === undefined) return all;
    const text = String(raw);
    return key === lower || vars?.[key] !== undefined || terms[key] !== undefined ? text : capitalise(text);
  });
}
