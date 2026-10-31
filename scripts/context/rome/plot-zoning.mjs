// Writes the AD 100 zoning as a flat review plan (SVG, plus a PNG where macOS Quick Look is available) in docs/previews/rome-zoning.
// The drawing is lib/scenarios/zoningPlan.ts, the same one the app shows under Map layers → View 2D plan.
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadTypescript } from '../../lib/load-typescript.mjs';
const { zoningPlanSvg, PLAN_WIDTH, PLAN_HEIGHT } = await import(await loadTypescript('lib/scenarios/zoningPlan'));
const out = 'docs/previews/rome-zoning';
await mkdir(out, { recursive: true });
await writeFile(`${out}/zoning-ad100.svg`, zoningPlanSvg(100));
// PNG: headless Chrome at the plan's own size where it is installed (Quick Look crops to a square, so it is only the fallback).
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let png = spawnSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', `--window-size=${PLAN_WIDTH},${PLAN_HEIGHT}`, `--screenshot=${process.cwd()}/${out}/zoning-ad100.png`, `file://${process.cwd()}/${out}/zoning-ad100.svg`], { encoding: 'utf8' }).status === 0;
if (!png) { png = spawnSync('qlmanage', ['-t', '-s', String(PLAN_WIDTH), '-o', out, `${out}/zoning-ad100.svg`]).status === 0; if (png) spawnSync('mv', [`${out}/zoning-ad100.svg.png`, `${out}/zoning-ad100.png`]); }
console.log(`wrote ${out}/zoning-ad100.svg${png ? ' and .png' : ' (no PNG: neither Chrome nor Quick Look available)'}`);
