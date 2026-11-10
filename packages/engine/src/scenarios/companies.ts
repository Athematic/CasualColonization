/**
 * The chartered companies the scenarios offer (companies.ts, docs/design/cooperation.md step 3).
 * Leaf data, like the other scenario tables: each is a company player's identity (name, colour,
 * colony names, port), who may charter it and from when.
 */
import type { CompanyEntry } from './types.js';

const none = { text: 'A chartered company: no Crown, no taxes, no independence.' };

/** The Hudson's Bay Company (1670): furs from the bay's rivers, by charter of Charles II. */
export const HUDSONS_BAY: CompanyEntry = {
  id: 'hudsonsBay', name: "the Hudson's Bay Company", adjective: "Hudson's Bay", color: '#7b2d26',
  bonus: none, founders: ['england'], from: 1670,
  colonyNames: ['York Factory', 'Moose Factory', 'Fort Albany', 'Fort Prince of Wales', 'Rupert House', 'Fort Severn'],
  port: { name: 'London' },
};

/** The Dutch West India Company (1621): New Netherland, Curaçao, Dutch Brazil. */
export const WEST_INDIA: CompanyEntry = {
  id: 'westIndia', name: 'the West India Company', adjective: 'West India Company', color: '#c9a227',
  bonus: none, founders: ['netherlands'], from: 1621,
  colonyNames: ['Fort Oranje', 'Nieuw Amsterdam', 'Fort Nassau', 'Willemstad', 'Mauritsstad', 'Fort Zeelandia'],
  port: { name: 'Vlissingen' },
};

/** The Mississippi Company (1684, as the Compagnie d'Occident 1717): Louisiana. */
export const MISSISSIPPI: CompanyEntry = {
  id: 'mississippi', name: 'the Mississippi Company', adjective: 'Mississippi Company', color: '#4f7cac',
  bonus: none, founders: ['france'], from: 1684,
  colonyNames: ['Nouvelle-Orléans', 'Biloxi', 'Mobile', 'Fort Rosalie', 'Natchitoches', 'Fort Toulouse'],
  port: { name: 'Lorient' },
};

/** The Company of Scotland, the Darien scheme (1695–1700). */
export const DARIEN: CompanyEntry = {
  id: 'darien', name: 'the Darien Company', adjective: 'Darien', color: '#2f6f8f',
  bonus: none, founders: ['scotland'], from: 1695,
  colonyNames: ['New Edinburgh', 'Fort St Andrew', 'New Caledonia', 'Port Paterson'],
  port: { name: 'Leith' },
};

/** Duke Jacob's Courland company: Tobago (1654) and the Gambia. */
export const COURLAND_COMPANY: CompanyEntry = {
  id: 'courlandCompany', name: 'the Courland Company', adjective: 'Courland Company', color: '#8a5a2b',
  bonus: none, founders: ['courland'], from: 1654,
  colonyNames: ['Jacobsfort', 'Neu-Kurland', 'Great Courland Bay', 'Fort Jacobus'],
  port: { name: 'Windau' },
};
