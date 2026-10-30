import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules = new Map();
export async function loadTypescript(path) {
  if (modules.has(path)) return modules.get(path);
  let output;
  if (path.endsWith('.json')) output = `export default JSON.parse(${JSON.stringify(await readFile(path, 'utf8'))});`;
  else ({ outputText: output } = ts.transpileModule(await readFile(`${path}.ts`, 'utf8').catch(() => readFile(`${path}.tsx`, 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }));
  for (const match of [...output.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const spec = match[1], url = spec.startsWith('@/') ? await loadTypescript(spec.slice(2)) : import.meta.resolve(spec);
    output = output.replace(match[0], `from "${url}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`; modules.set(path, url); return url;
}
