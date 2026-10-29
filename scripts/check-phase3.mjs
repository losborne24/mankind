// Reproducible integration gate. Preserve older benchmark files written by legacy checks.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const reports = ['docs/previews/ambient-life-node-performance.json', 'docs/previews/settlement-density/generation-performance.json'];
const originals = new Map(reports.map(path => [path, readFileSync(path)]));
const checks = readdirSync('scripts').filter(name => /^check-.*\.mjs$/.test(name) && name !== 'check-phase3.mjs').sort();
const commands = checks.map(name => [process.execPath, [`scripts/${name}`]]);
commands.push(['pnpm', ['typecheck']], ['pnpm', ['lint']], ['pnpm', ['exec', 'next', 'build', '--webpack']]);
const results = [];
const reportDirectory = process.argv[2] ?? 'docs/previews/phase3-final';
mkdirSync(reportDirectory, { recursive: true });
try {
  for (const [command, args] of commands) {
    const started = performance.now();
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const row = { command: [command === process.execPath ? 'node' : command, ...args].join(' '), exit: result.status,
      ms: performance.now() - started, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
    results.push(row);
    console.log(`${row.exit === 0 ? 'PASS' : 'FAIL'} ${row.command}`);
    writeFileSync(`${reportDirectory}/regression.json`, JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2) + '\n');
  }
} finally {
  for (const [path, bytes] of originals) writeFileSync(path, bytes);
}
if (results.some(result => result.exit !== 0)) process.exitCode = 1;
