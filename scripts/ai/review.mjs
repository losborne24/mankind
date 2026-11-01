// Review AI drafts (Phase 5B). Nothing AI-drafted is used until a named person accepts it; decisions are append-only.
//   node scripts/ai/review.mjs list
//   node scripts/ai/review.mjs show claims pleiades-forum-boarium
//   node scripts/ai/review.mjs accept claims pleiades-forum-boarium --reviewer "Name" [--note "..."]
//   node scripts/ai/review.mjs reject blueprint draft-rome-pleiades --reviewer "Name" --note "why"
import { loadTypescript } from '../lib/load-typescript.mjs';
const { listDrafts, readDraft, review, status } = await import(await loadTypescript('lib/ai/review'));
const [command, kind, id] = process.argv.slice(2), opt = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
if (command === 'list') { for (const k of ['claims', 'blueprint']) for (const d of listDrafts(k)) console.log(`${status(k, d).padEnd(8)} ${k} ${d}`); }
else if (command === 'show') console.log(JSON.stringify(readDraft(kind, id), null, 2));
else if (command === 'accept' || command === 'reject') console.log(review(kind, id, command === 'accept' ? 'accepted' : 'rejected', opt('--reviewer') ?? '', opt('--note') ?? ''));
else { console.error('Usage: list | show <claims|blueprint> <id> | accept|reject <claims|blueprint> <id> --reviewer "Name" [--note "..."]'); process.exit(2); }
