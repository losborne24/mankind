// Check the emitted page's actual styles after a build, not just compiler exit status.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile('.next/server/app/index.html', 'utf8');
const links = [...html.matchAll(/<link\b[^>]*>/g)].map(m => m[0]).filter(tag => /rel="stylesheet"/.test(tag));
const paths = links.map(tag => /href="([^"?]+)/.exec(tag)?.[1]).filter(Boolean);
assert.ok(paths.length, 'Prerendered root page must link CSS');
let css = '';
for (const path of paths) {
  assert.ok(path.startsWith('/_next/static/') && !path.includes('..'), 'Expected emitted local build stylesheet');
  css += await readFile(`.next/${path.slice('/_next/'.length)}`, 'utf8');
}
assert.ok(!/@theme\b|@import\s*['"]tailwindcss['"]/.test(css), 'Tailwind directives must be compiled in production');
for (const selector of ['.h-full', '.w-full', '.absolute', '.flex', '.bg-background', '.bg-panel']) {
  assert.ok(new RegExp(selector.replaceAll('.', '\\.') + '(?=[{,\\s])').test(css), `Missing emitted layout utility ${selector}`);
}
console.log(`Production styles: ${paths.length} page-linked stylesheets; compiled map layout, panels and Tailwind directives pass.`);
