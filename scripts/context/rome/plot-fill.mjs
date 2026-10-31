// Writes the zoned fill (lib/scenarios/romeFill.ts) as flat review plans in docs/previews/rome-fill: the whole frame, and the
// city at four times the scale. Field strips, buildings, tombs and aqueduct piers in their own colours over the zones' rivers.
// Only the PNGs are kept: the SVGs run to megabytes and come back with one run.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadTypescript } from '../../lib/load-typescript.mjs';
const { generateRomeFill } = await import(await loadTypescript('lib/scenarios/romeFill'));
const { romeZoning } = await import(await loadTypescript('lib/scenarios/zoning'));
const { forumReconstruction } = await import(await loadTypescript('lib/history/localContext'));
const { offsetCoordinate } = await import(await loadTypescript('map/settlements/romanSettlement'));
const origin = forumReconstruction.origin, neighbourhood = forumReconstruction.objects.map(o => o.footprint.map(p => offsetCoordinate(origin, p)));
const fill = generateRomeFill(neighbourhood), out = 'docs/previews/rome-fill';
await mkdir(out, { recursive: true });
function plan(name, [x0, y0, x1, y1], size) {
  const X = x => (x - x0) / (x1 - x0) * size, Y = y => (y1 - y) / (y1 - y0) * size, f = v => v.toFixed(1);
  const path = ring => 'M' + ring.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L') + 'Z';
  const inView = ring => ring.some(p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#8f8a66"/>`;
  for (const i of fill.items.filter(i => i.kind === 'field' && inView(i.ring))) s += `<path d="${path(i.ring)}" fill="${i.colour}" fill-opacity=".8"/>`;
  for (const z of romeZoning.zones.filter(z => z.ring === 'river')) s += `<path d="${z.multipolygon.map(poly => poly.map(path).join('')).join('')}" fill="#5f8ea3"/>`;
  for (const l of romeZoning.lines.filter(l => l.kind === 'road')) s += `<path d="${[...l.lines, ...(l.gaps ?? [])].map(line => 'M' + line.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join('L')).join('')}" fill="none" stroke="#e8d3a2" stroke-width="1.5"/>`;
  s += `<path d="${neighbourhood.filter(inView).map(path).join('')}" fill="#7a4fa0"/>`;
  for (const i of fill.items.filter(i => i.kind !== 'field' && inView(i.ring))) s += `<path d="${path(i.ring)}" fill="${i.kind === 'tomb' ? '#efe6cf' : i.kind === 'pier' || i.kind === 'channel' ? '#dfe8f0' : i.colour}"/>`;
  s += `<path d="${path(romeZoning.extent.ring)}" fill="none" stroke="#fff6e0" stroke-width="1.5" stroke-dasharray="8 5"/></svg>\n`;
  return writeFile(`${out}/${name}.svg`, s).then(() => spawnSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--hide-scrollbars', `--window-size=${size},${size}`, `--screenshot=${process.cwd()}/${out}/${name}.png`, `file://${process.cwd()}/${out}/${name}.svg`])).then(() => unlink(`${out}/${name}.svg`));
}
const [[w, s], , [e, n]] = romeZoning.frame;
await plan('fill-frame', [w, s, e, n], 1600);
await plan('fill-city', [12.455, 41.868, 12.515, 41.913], 1600);
await plan('fill-detail', [12.470, 41.884, 12.490, 41.899], 1600);
await plan('fill-landmarks', [12.468, 41.887, 12.496, 41.908], 1600);
console.log('wrote', out, JSON.stringify(fill.counts));
