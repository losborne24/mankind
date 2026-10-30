import { readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadTypescript } from './lib/load-typescript.mjs';
const { validateAssetCatalogue: validate, catalogueKey, catalogueStatus } = await import(await loadTypescript('lib/assets/catalogueValidation'));
const { assetRegistry } = await import(await loadTypescript('lib/assets/registry'));
const read = async path => { const bytes = await readFile(path); if (bytes.length > 2 * 1024 * 1024) throw Error('Catalogue file exceeds 2 MiB'); return JSON.parse(bytes.toString('utf8')); };
export async function checkCatalogueFiles(catalogue) {
  const base = resolve('public/assets');
  for (const e of catalogue.entries) if (e.rendering) {
    const asset = Object.hasOwn(assetRegistry, e.rendering.registryId) ? assetRegistry[e.rendering.registryId] : undefined;
    if (!asset || asset.category !== e.category) throw Error('Catalogue rendering binding is missing or has the wrong category');
    const path = resolve(base, asset.path); if (!path.startsWith(base + sep)) throw Error('Model outside asset directory');
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== e.rendering.sha256) throw Error('Catalogue model checksum mismatch');
  }
}
export async function runCatalogue(args) {
  const options = [...args]; let file = 'lib/assets/catalogue.json';
  const index = options.indexOf('--file'); if (index !== -1) { if (!options[index + 1]) throw Error('Missing catalogue path'); file = options[index + 1]; options.splice(index, 2); }
  const [command, ...rest] = options;
  if (!['list', 'validate', 'add', 'review'].includes(command)) throw Error('Usage: asset-catalogue.mjs list|validate|add entry.json|review id version review.json [--file catalogue.json]');
  if (command === 'list' || command === 'validate') {
    if (rest.length) throw Error('Unexpected catalogue arguments');
    const c = validate(await read(file)); await checkCatalogueFiles(c);
    return command === 'list' ? c.entries.map(e => ({ id: e.id, version: e.version, title: e.title, status: catalogueStatus(c, e) })) : { entries: c.entries.length, reviews: c.reviews.length, valid: true };
  }
  const lock = `${file}.lock`; const handle = await open(lock, 'wx');
  const temporary = resolve(dirname(file), `.catalogue-${randomUUID()}.tmp`);
  try {
    const current = validate(await read(file)), next = structuredClone(current);
    if (command === 'add') {
      if (rest.length !== 1) throw Error('add requires one entry JSON file');
      const entry = await read(rest[0]);
      if (next.entries.some(e => catalogueKey(e) === catalogueKey(entry))) throw Error('Catalogue version content is immutable');
      const prior = next.entries.filter(e => e.id === entry.id);
      if (entry.version !== Math.max(0, ...prior.map(e => e.version)) + 1) throw Error('Add the next integer version');
      if (prior.some(e => e.placeId !== entry.placeId || e.category !== entry.category)) throw Error('Catalogue identity cannot change place or category');
      next.entries.push(entry);
    } else {
      if (rest.length !== 3) throw Error('review requires ID, integer version and review JSON');
      const [id, versionText, path] = rest, review = await read(path);
      if (Object.keys(review).some(k => !['status', 'at', 'reviewer', 'note'].includes(k))) throw Error('Unknown review field');
      next.reviews.push({ ...review, id, version: Number(versionText) });
    }
    const validated = validate(next); await checkCatalogueFiles(validated);
    await writeFile(temporary, JSON.stringify(validated, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    return { entries: validated.entries.length, reviews: validated.reviews.length, saved: file };
  } finally { await unlink(temporary).catch(() => {}); await handle.close(); await unlink(lock); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(JSON.stringify(await runCatalogue(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
