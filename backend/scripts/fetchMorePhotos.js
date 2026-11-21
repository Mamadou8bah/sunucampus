// Tops up the demo portraits without touching the photos already chosen.
//
//   npm run photos:more -- women=10 men=8
//
// New photos go to seed-photos/_candidates/{women,men}/ so they can be checked by eye first.
// Move the good ones into seed-photos/{women,men}/; their credits are in _candidates/CREDITS.md.
// Photos already used or rejected (any file in women/, men/ or _rejected/) are skipped.
import { mkdir, writeFile, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BACKEND_ROOT } from '../src/config/paths.js';

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error('Set UNSPLASH_ACCESS_KEY in backend/.env first (free at https://unsplash.com/developers).');
  process.exit(1);
}

const OUT = join(BACKEND_ROOT, 'seed-photos');
const CANDIDATES = join(OUT, '_candidates');
const want = { women: 10, men: 8 };
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  if (k in want) want[k] = Number(v);
}
// Different searches from photos:fetch, so the results are new faces.
const QUERIES = {
  women: ['gambian woman portrait', 'senegalese woman portrait', 'young african woman headshot'],
  men: ['young african man student portrait', 'young black man smiling portrait', 'gambian man portrait'],
};

const api = async (path) => {
  const res = await fetch(`https://api.unsplash.com${path}`, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
  return res.json();
};

async function knownIds() {
  const ids = new Set();
  for (const dir of ['women', 'men', '_rejected', '_candidates/women', '_candidates/men']) {
    const path = join(OUT, dir);
    if (!existsSync(path)) continue;
    for (const f of await readdir(path)) ids.add(f.replace(/\.[a-z]+$/i, ''));
  }
  return ids;
}

const known = await knownIds();
const credits = [];

for (const [group, queries] of Object.entries(QUERIES)) {
  const dir = join(CANDIDATES, group);
  await mkdir(dir, { recursive: true });
  const picked = [];
  for (const query of queries) {
    if (picked.length >= want[group]) break;
    const data = await api(`/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=portrait&content_filter=high`);
    for (const photo of data.results) {
      if (picked.length >= want[group]) break;
      if (known.has(photo.id) || photo.premium || photo.plus) continue;
      known.add(photo.id);
      picked.push(photo);
    }
  }
  for (const photo of picked) {
    const res = await fetch(`${photo.urls.raw}&w=640&h=800&fit=crop&crop=faces&q=75&fm=jpg`);
    if (!res.ok) continue;
    await writeFile(join(dir, `${photo.id}.jpg`), Buffer.from(await res.arrayBuffer()));
    // Required by the API guidelines whenever a photo is downloaded.
    await api(photo.links.download_location.replace('https://api.unsplash.com', '')).catch(() => {});
    const profile = `${photo.user.links.html}?utm_source=sunucampus&utm_medium=referral`;
    credits.push(`- \`${group}/${photo.id}.jpg\`: photo by [${photo.user.name}](${profile}) on Unsplash`);
    console.log(`${group}: ${photo.id} by ${photo.user.name}`);
  }
}

await appendFile(join(CANDIDATES, 'CREDITS.md'), `${credits.join('\n')}\n`);
console.log(`\nSaved candidates to ${CANDIDATES}. Check them, move the good ones into seed-photos/{women,men}/.`);
