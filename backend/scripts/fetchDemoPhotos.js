// Downloads free portrait photos for the demo students from the official Unsplash API.
//
//   1. Create a free app at https://unsplash.com/developers and copy its Access Key.
//   2. Add UNSPLASH_ACCESS_KEY=... to backend/.env
//   3. npm run photos:fetch     then     npm run seed:demo -- --reset
//
// Photos are saved to backend/seed-photos/{women,men}/ with a CREDITS.md naming each photographer,
// as the Unsplash API guidelines ask. Six are also copied to the frontend for the intro screens.
// Only photos under the free Unsplash License are used (Unsplash+ photos are skipped).
import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BACKEND_ROOT } from '../src/config/paths.js';

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error('Set UNSPLASH_ACCESS_KEY in backend/.env first (free at https://unsplash.com/developers).');
  process.exit(1);
}

const OUT = join(BACKEND_ROOT, 'seed-photos');
const INTRO = join(BACKEND_ROOT, '..', 'frontend', 'public', 'intro');
// Demo Unsplash apps get 50 requests an hour: at most 4 searches + 44 download notifications.
const PER_GROUP = 22;
const QUERIES = {
  women: ['african woman portrait smiling', 'black woman student portrait'],
  men: ['african man portrait smiling', 'black man student portrait'],
};

const api = async (path) => {
  const res = await fetch(`https://api.unsplash.com${path}`, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
  return res.json();
};

const credits = ['# Demo photo credits', '', 'Photos from [Unsplash](https://unsplash.com/?utm_source=sunucampus&utm_medium=referral), used under the Unsplash License for demo data only.', ''];

for (const [group, queries] of Object.entries(QUERIES)) {
  const dir = join(OUT, group);
  await mkdir(dir, { recursive: true });
  const seen = new Set();
  const picked = [];

  for (const query of queries) {
    if (picked.length >= PER_GROUP) break;
    const data = await api(`/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=portrait&content_filter=high`);
    for (const photo of data.results) {
      if (picked.length >= PER_GROUP) break;
      if (seen.has(photo.id) || photo.premium || photo.plus) continue;
      seen.add(photo.id);
      picked.push(photo);
    }
  }

  credits.push(`## ${group[0].toUpperCase()}${group.slice(1)}`, '');
  for (const photo of picked) {
    // Square-ish crop centred on the face, small enough for a fast demo.
    const url = `${photo.urls.raw}&w=640&h=800&fit=crop&crop=faces&q=75&fm=jpg`;
    const res = await fetch(url);
    if (!res.ok) continue;
    await writeFile(join(dir, `${photo.id}.jpg`), Buffer.from(await res.arrayBuffer()));
    // Required by the API guidelines whenever a photo is downloaded.
    await api(photo.links.download_location.replace('https://api.unsplash.com', '')).catch(() => {});
    const profile = `${photo.user.links.html}?utm_source=sunucampus&utm_medium=referral`;
    credits.push(`- \`${group}/${photo.id}.jpg\`: photo by [${photo.user.name}](${profile}) on Unsplash`);
    console.log(`${group}: ${photo.id} by ${photo.user.name}`);
  }
  credits.push('');
}

await writeFile(join(OUT, 'CREDITS.md'), credits.join('\n'));

// A few faces for the intro screens.
await mkdir(INTRO, { recursive: true });
let n = 1;
for (const group of ['women', 'men']) {
  const files = (await readdir(join(OUT, group))).filter((f) => f.endsWith('.jpg')).slice(0, 3);
  for (const f of files) await copyFile(join(OUT, group, f), join(INTRO, `face-${n++}.jpg`));
}
await copyFile(join(OUT, 'CREDITS.md'), join(INTRO, 'CREDITS.md'));
console.log(`\nSaved photos to ${OUT}. Now run: npm run seed:demo -- --reset`);
