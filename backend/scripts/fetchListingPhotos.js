// Downloads one free photo per demo marketplace item from the official Unsplash API.
// Uses about 32 requests (a search and a download notification per item).
//   npm run photos:listings     then     npm run seed:demo -- --reset
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BACKEND_ROOT } from '../src/config/paths.js';
import { DEMO_LISTINGS } from './demoListings.js';

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error('Set UNSPLASH_ACCESS_KEY in backend/.env first.');
  process.exit(1);
}

const OUT = join(BACKEND_ROOT, 'seed-photos', 'listings');
await mkdir(OUT, { recursive: true });

const api = async (path) => {
  const res = await fetch(`https://api.unsplash.com${path}`, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
  return res.json();
};

const credits = ['', '## Marketplace items', ''];
for (const item of DEMO_LISTINGS) {
  const data = await api(`/search/photos?query=${encodeURIComponent(item.photoQuery)}&per_page=5&content_filter=high&orientation=squarish`);
  const photo = data.results.find((p) => !p.premium && !p.plus);
  if (!photo) {
    console.log(`No free photo for ${item.slug}`);
    continue;
  }
  const res = await fetch(`${photo.urls.raw}&w=800&h=800&fit=crop&q=75&fm=jpg`);
  await writeFile(join(OUT, `${item.slug}.jpg`), Buffer.from(await res.arrayBuffer()));
  await api(photo.links.download_location.replace('https://api.unsplash.com', '')).catch(() => {});
  credits.push(`- \`listings/${item.slug}.jpg\`: photo by [${photo.user.name}](${photo.user.links.html}?utm_source=sunucampus&utm_medium=referral) on Unsplash`);
  console.log(`${item.slug}: ${photo.user.name}`);
}

// Append to the shared credits file.
const creditsFile = join(BACKEND_ROOT, 'seed-photos', 'CREDITS.md');
const existing = await readFile(creditsFile, 'utf8').catch(() => '# Demo photo credits\n');
const cleaned = existing.split('\n## Marketplace items')[0].trimEnd();
await writeFile(creditsFile, `${cleaned}\n${credits.join('\n')}\n`);
console.log('\nDone. Now run: npm run seed:demo -- --reset');
