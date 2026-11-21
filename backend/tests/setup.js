import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.ALLOWED_EMAIL_DOMAINS = '';

// Use an installed MongoDB server for the in-memory test database when one exists,
// instead of downloading a separate ~800 MB binary. Override with MONGOMS_SYSTEM_BINARY.
if (!process.env.MONGOMS_SYSTEM_BINARY && process.platform === 'win32') {
  const root = 'C:\\Program Files\\MongoDB\\Server';
  if (existsSync(root)) {
    const versions = readdirSync(root).sort().reverse();
    const binary = versions.map((v) => join(root, v, 'bin', 'mongod.exe')).find(existsSync);
    if (binary) process.env.MONGOMS_SYSTEM_BINARY = binary;
  }
}

// Test uploads go to a throwaway folder, never backend/uploads.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'sunucampus-uploads-'));
