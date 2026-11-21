/**
 * Gives demo students who have no profile photo one of the unused photos in seed-photos/,
 * matching the photo to their first name. Keeps everything else in the database as it is.
 *
 *   npm run photos:assign
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { User } from '../src/models/User.js';
import { BACKEND_ROOT, UPLOADS_DIR } from '../src/config/paths.js';
import { DEMO_DOMAIN, FEMALE } from './seedDemo.js';

export async function assignDemoPhotos({ log = console.log } = {}) {
  const target = join(UPLOADS_DIR, 'avatars');
  mkdirSync(target, { recursive: true });
  const students = await User.find({ email: new RegExp(`@${DEMO_DOMAIN.replace(/\./g, '\\.')}$`) }, 'name avatarUrl');
  const used = new Set(students.map((s) => s.avatarUrl).filter(Boolean));

  const free = {};
  for (const group of ['women', 'men']) {
    const dir = join(BACKEND_ROOT, 'seed-photos', group);
    free[group] = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .sort()
          .filter((f) => !used.has(`/uploads/avatars/demo-${f}`))
      : [];
  }

  let assigned = 0;
  for (const student of students.filter((s) => !s.avatarUrl)) {
    const group = FEMALE.has(student.name.split(' ')[0]) ? 'women' : 'men';
    const file = free[group].shift();
    if (!file) continue;
    copyFileSync(join(BACKEND_ROOT, 'seed-photos', group, file), join(target, `demo-${file}`));
    student.avatarUrl = `/uploads/avatars/demo-${file}`;
    await student.save();
    assigned += 1;
  }
  const missing = students.filter((s) => !s.avatarUrl).length;
  log(`Gave ${assigned} demo students a photo${missing ? `; ${missing} still use initials` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../src/config/db.js');
  const { env } = await import('../src/config/env.js');
  await connectDB(env.mongoUri);
  await assignDemoPhotos();
  await disconnectDB();
}
