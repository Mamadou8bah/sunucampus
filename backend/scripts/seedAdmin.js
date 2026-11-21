// Creates (or promotes) the initial administrator from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
// Run with: npm run seed:admin
import { pathToFileURL } from 'node:url';
import { User } from '../src/models/User.js';
import { ROLES, ACCOUNT_STATUS } from '../src/config/roles.js';

export async function seedAdmin({
  email = process.env.ADMIN_EMAIL ?? 'admin@sunucampus.local',
  password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123',
  name = process.env.ADMIN_NAME ?? 'Platform Admin',
} = {}) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.role = ROLES.ADMIN;
    existing.status = ACCOUNT_STATUS.ACTIVE;
    await existing.save();
    console.log(`Promoted existing user ${email} to admin`);
    return existing;
  }
  const admin = await User.create({ name, email, password, role: ROLES.ADMIN });
  console.log(`Created admin ${email}`);
  return admin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../src/config/db.js');
  const { env } = await import('../src/config/env.js');
  await connectDB(env.mongoUri);
  await seedAdmin();
  await disconnectDB();
}
