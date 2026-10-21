import { deserialize, type GameState } from '@cc/engine';

const AUTO = 'cc.save.auto';
const MANUAL = 'cc.save.manual';

function write(key: string, json: string): boolean {
  try {
    localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

function read(key: string): GameState | null {
  try {
    const json = localStorage.getItem(key);
    return json ? deserialize(json) : null;
  } catch {
    return null;
  }
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

export function pickSaveFile(): Promise<GameState | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(deserialize(await file.text()));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
