import { deserialize, SaveVersionError, type GameState } from '@cc/engine';

const AUTO = 'cc.save.auto';
const MANUAL = 'cc.save.manual';

/** A save that was read: the game, or why it cannot be loaded (for example, a save from before 0.4). */
export type LoadedSave = { state: GameState; error?: undefined } | { state?: undefined; error: string };

function write(key: string, json: string): boolean {
  try {
    localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

/** Reads a save, turning a failure into a message a person can understand. */
export function readSave(json: string): LoadedSave {
  try {
    return { state: deserialize(json) };
  } catch (e) {
    if (e instanceof SaveVersionError) return { error: e.message };
    return { error: 'That is not a Casual Colonization save, or it is damaged.' };
  }
}

function read(key: string): LoadedSave | null {
  let json: string | null = null;
  try {
    json = localStorage.getItem(key);
  } catch {
    return null;
  }
  return json ? readSave(json) : null;
}

export const saveAuto = (json: string) => write(AUTO, json);
export const saveManual = (json: string) => write(MANUAL, json);
export const loadAuto = () => read(AUTO);
export const loadManual = () => read(MANUAL);

export function downloadSave(json: string, name: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lets the person pick a save file; resolves with null when they cancel. */
export function pickSaveFile(): Promise<LoadedSave | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(readSave(await file.text()));
      } catch {
        resolve({ error: 'The file could not be read.' });
      }
    };
    input.click();
  });
}
