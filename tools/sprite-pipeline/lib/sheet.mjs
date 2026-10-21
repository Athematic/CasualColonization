// Contact sheet (out/index.html): every sprite at every size, on paper and on
// a map tile, small sizes also enlarged 4x with nearest-neighbour, the
// smooth/pixel boundary side by side, and a tuning section.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function img(src, size, zoom, cls = '') {
  const px = size * zoom;
  return `<img src="${esc(src)}" width="${px}" height="${px}" data-size="${size}" data-zoom="${zoom}" class="${zoom > 1 ? 'zoom' : 'native'} ${cls}" alt="">`;
}

function tile(bg, src, size, zoom, label = '') {
  return `<figure class="t ${bg}">${img(src, size, zoom)}${label ? `<figcaption>${esc(label)}</figcaption>` : ''}</figure>`;
}

/**
 * @param data {
 *   sprites: [{ id, layout, orig, files: {size: path}, mode: {size: 'pixel'|'smooth'}, compare: {size: {smooth, pixel}}, extras }],
 *   sizes, pixelSizes, smoothSizes, boundary: [sizes], tuning: [{ id, variants: [{label, files: {size: path}}] }], settings, tuningSizes
 * }
 */
export function contactSheet(data) {
  const { sprites, pixelSizes, smoothSizes, boundary, tuning, tuningSizes, settings, sourceLabel } = data;
  const rows = sprites.map((s) => {
    const pix = pixelSizes.map((n) => `<div class="grp"><div class="h">${n} px · pixel</div><div class="cells">
      ${tile('paper', s.files[n], n, 1)}${tile('grass', s.files[n], n, 1)}
      ${tile('paper', s.files[n], n, 4)}${tile('grass', s.files[n], n, 4)}</div></div>`).join('');
    const smo = smoothSizes.map((n) => `<div class="grp"><div class="h">${n} px</div><div class="cells">
      ${tile('paper', s.files[n], n, 1)}${tile('grass', s.files[n], n, 1)}</div></div>`).join('');
    return `<section class="sprite" id="${esc(s.id)}">
      <div class="name">${esc(s.id)} <span class="muted">${esc(s.layout)}${s.extras.length ? ' · extra colours ' + s.extras.map((h) => `<i class="sw" style="background:${h}" title="${h}"></i>`).join('') : ''}</span></div>
      <div class="line">
        <div class="grp"><div class="h">master</div><div class="cells"><figure class="t paper"><img src="${esc(s.orig)}" width="112" height="112" alt=""></figure></div></div>
        ${pix}${smo}
      </div></section>`;
  }).join('\n');

  const bnd = sprites.map((s) => `<div class="bcard"><div class="name">${esc(s.id.split('/').pop())}</div><div class="cells">
    ${boundary.map((n) => `<div class="grp"><div class="h">${n}: smooth | pixel</div><div class="cells">
      ${tile('grass', s.compare[n].smooth, n, 1)}${tile('grass', s.compare[n].pixel, n, 1)}
      ${tile('paper', s.compare[n].smooth, n, 3)}${tile('paper', s.compare[n].pixel, n, 3)}</div></div>`).join('')}
    </div></div>`).join('\n');

  const tun = tuning.map((t) => `<section class="sprite"><div class="name">${esc(t.id)}</div><div class="line">
    ${t.variants.map((v) => `<div class="grp"><div class="h">${esc(v.label)}</div><div class="cells">
      ${tuningSizes.map((n) => tile('grass', v.files[n], n, 1)).join('')}
      ${tuningSizes.map((n) => tile('paper', v.files[n], n, n <= 24 ? 4 : 3)).join('')}</div></div>`).join('')}
    </div></section>`).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sprite pipeline contact sheet</title>
<style>
:root { --paper:#f5eedc; --grass:#a6d878; --ink:#1b1a17; --muted:#6b665c; --line:#d9cfb6; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: #ece4cf; color: var(--ink); font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 22px 0 6px; border-bottom: 2px solid var(--ink); padding-bottom: 2px; }
p { margin: 4px 0; max-width: 980px; } .muted { color: var(--muted); font-weight: normal; }
code { background: #fff8; padding: 0 3px; border-radius: 3px; }
.controls { position: sticky; top: 0; z-index: 2; background: #ece4cf; padding: 6px 0; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
.sprite { background: #fffdf6; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
.name { font-weight: 600; margin-bottom: 4px; }
.line, .cells { display: flex; flex-wrap: wrap; gap: 4px; align-items: flex-end; }
.line { gap: 10px; }
.grp .h { font-size: 11px; color: var(--muted); margin-bottom: 2px; white-space: nowrap; }
figure.t { margin: 0; padding: 3px; border-radius: 3px; line-height: 0; position: relative; }
figure.paper { background: var(--paper); }
figure.grass { background: var(--grass); box-shadow: inset 0 0 0 1px rgba(27,26,23,.18); }
figure figcaption { font-size: 10px; line-height: 1.2; }
img { display: block; }
img.zoom { image-rendering: pixelated; image-rendering: crisp-edges; }
body.crisp img.native { image-rendering: pixelated; }
.sw { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--ink); vertical-align: -1px; margin-left: 2px; }
.bgrid { display: flex; flex-wrap: wrap; gap: 6px; }
.bcard { background: #fffdf6; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
.settings { font: 11px/1.3 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; background: #fffdf6; border: 1px solid var(--line); padding: 6px; border-radius: 6px; max-height: 220px; overflow: auto; }
</style></head><body>
<h1>Sprite pipeline contact sheet</h1>
<p class="muted">Source: ${esc(sourceLabel)} · ${sprites.length} sprites · pixel sizes ${pixelSizes.join(', ')} · smooth sizes ${smoothSizes.join(', ')}</p>
<p>Each row: the master, then every runtime size at 1:1 on paper and on a grassland map tile. Pixel sizes are also shown 4× with nearest-neighbour so single pixels are visible.
"True device pixels" draws 1:1 images at one image pixel per screen pixel on high-DPI screens, which is how the game will show them.</p>
<div class="controls"><label><input type="checkbox" id="dev" checked> True device pixels</label>
 · <a href="#runtime">Runtime sizes</a> · <a href="#boundary">Boundary</a> · <a href="#tuning">Tuning</a> · <a href="#settings">Settings</a></div>
<h2 id="runtime">Runtime sizes</h2>
${rows}
<h2 id="boundary">Boundary: smooth vs pixel</h2>
<p>At the sizes either side of the switch-over (<code>--pixel-max</code>), the smooth render (left) and the pixel render (right), 1:1 on grass and 3× on paper.</p>
<div class="bgrid">${bnd}</div>
<h2 id="tuning">Tuning: pixel settings</h2>
<p>Variants of the pixel settings for a few sprites whose role props must survive (axe, musket, cross, horse and telescope). Sizes ${tuningSizes.join(', ')}: 1:1 on grass, then enlarged on paper.</p>
${tun}
<h2 id="settings">Settings</h2>
<div class="settings">${esc(JSON.stringify(settings, null, 2))}</div>
<script>
const box = document.getElementById('dev');
function apply() {
  const dpr = box.checked ? (window.devicePixelRatio || 1) : 1;
  for (const im of document.querySelectorAll('img.native')) {
    const n = +im.dataset.size;
    im.style.width = im.style.height = (n / dpr) + 'px';
  }
}
box.addEventListener('change', apply); apply();
</script>
</body></html>
`;
}
