import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Uploaded files (profile photos). Override with UPLOADS_DIR, e.g. a mounted volume in production.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(BACKEND_ROOT, 'uploads');
