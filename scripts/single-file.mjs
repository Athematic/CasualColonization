// Inlines the Vite build into one self-contained HTML file (for hosts that serve a single page).
// Usage: node scripts/single-file.mjs <out.html> [--fragment]
//   --fragment  omit <!doctype>/<html>/<head>/<body> for hosts that add their own skeleton.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'apps/web/dist';
const out = process.argv[2] ?? 'casual-colonization.html';
const fragment = process.argv.includes('--fragment');
const assets = readdirSync(join(dist, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap">';

const body = `<div id="app"></div>\n<script type="module">\n${safeJs}\n</script>`;
const head = `<title>Casual Colonization</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}\n</style>`;
const html = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
