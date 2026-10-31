// Writes the AD 100 zoning as a flat review plan (SVG, plus a PNG where macOS Quick Look is available) in docs/previews/rome-zoning.
// The drawing is lib/scenarios/zoningPlan.ts, the same one the app shows under Map layers → View 2D plan.
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadTypescript } from '../../lib/load-typescript.mjs';
const { zoningPlanSvg } = await import(await loadTypescript('lib/scenarios/zoningPlan'));
const out = 'docs/previews/rome-zoning';
await mkdir(out, { recursive: true });
await writeFile(`${out}/zoning-ad100.svg`, zoningPlanSvg(100));
const ql = spawnSync('qlmanage', ['-t', '-s', '1600', '-o', out, `${out}/zoning-ad100.svg`], { encoding: 'utf8' });
if (ql.status === 0) spawnSync('mv', [`${out}/zoning-ad100.svg.png`, `${out}/zoning-ad100.png`]);
console.log(`wrote ${out}/zoning-ad100.svg${ql.status === 0 ? ' and .png' : ' (no PNG: Quick Look not available)'}`);
