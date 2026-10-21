import { h } from '../dom.js';

export interface Choice<T> {
  label: string;
  value: T;
  primary?: boolean;
  disabled?: boolean;
  hint?: string;
}

function layer(): HTMLElement {
  let el = document.getElementById('dialog-layer');
  if (!el) {
    el = h('div', { id: 'dialog-layer' });
    document.body.appendChild(el);
  }
  return el;
}

/** Shows a small speech-bubble dialog and resolves with the chosen value (null if dismissed). */
export function choose<T>(title: string, text: string | Node, options: Choice<T>[]): Promise<T | null> {
  return new Promise((resolve) => {
    const close = (v: T | null) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    const box = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', null, title),
      typeof text === 'string' ? h('p', null, text) : text,
      h(
        'div',
        { class: 'dialog-actions' },
        options.map((o) =>
          h('button', { class: o.primary ? 'btn primary' : 'btn', disabled: o.disabled, title: o.hint, onclick: () => close(o.value) }, o.label),
        ),
      ),
    );
    const backdrop = h('div', { class: 'backdrop', onclick: (e: Event) => e.target === backdrop && close(null) }, box);
    layer().appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    (box.querySelector('button.primary') as HTMLButtonElement | null ?? box.querySelector('button'))?.focus();
  });
}

export function confirmDialog(title: string, text: string, yes = 'Yes', no = 'No'): Promise<boolean> {
  return choose(title, text, [
    { label: no, value: false },
    { label: yes, value: true, primary: true },
  ]).then((v) => v === true);
}

export function promptDialog(title: string, label: string, value: string): Promise<string | null> {
  const input = h('input', { type: 'text', value, 'aria-label': label, maxlength: 32 }) as HTMLInputElement;
  const body = h('label', { class: 'field' }, h('span', null, label), input);
  const p = choose<'ok'>(title, body, [
    { label: 'Cancel', value: null as unknown as 'ok' },
    { label: 'OK', value: 'ok', primary: true },
  ]);
  setTimeout(() => {
    input.focus();
    input.select();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (input.closest('.dialog')?.querySelector('button.primary') as HTMLButtonElement)?.click();
  });
  return p.then((v) => (v === 'ok' ? input.value : null));
}

export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const el = h('div', { class: `toast ${kind}` }, text);
  host.appendChild(el);
  while (host.children.length > 4) host.firstElementChild?.remove();
  setTimeout(() => el.classList.add('leaving'), kind === 'error' ? 3200 : 4200);
  setTimeout(() => el.remove(), kind === 'error' ? 3600 : 4600);
}
