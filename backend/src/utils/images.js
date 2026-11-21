import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { ApiError } from './ApiError.js';
import { UPLOADS_DIR } from '../config/paths.js';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Detects JPG, PNG or WebP from the file's first bytes, ignoring its name and claimed type. */
export function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Express middleware accepting up to `max` images in field `field`, with API-style errors. */
export function imageUpload({ field, max }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: max } });
  const handler = max === 1 ? upload.single(field) : upload.array(field, max);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Photos can be at most 3 MB'));
      if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') return next(ApiError.badRequest(`Add at most ${max} photos`));
      if (err) return next(ApiError.badRequest('Could not read that photo'));
      next();
    });
}

/** Validates and saves an uploaded image under uploads/<folder>/, returning its public URL. */
export async function saveImage(file, folder, prefix) {
  const ext = detectImage(file.buffer);
  if (!ext) throw ApiError.badRequest('Use a JPG, PNG or WebP photo');
  const dir = join(UPLOADS_DIR, folder);
  await mkdir(dir, { recursive: true });
  const name = `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  await writeFile(join(dir, name), file.buffer);
  return `/uploads/${folder}/${name}`;
}

/** Deletes a previously uploaded file. Ignores URLs that are not ours. */
export async function deleteUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  await unlink(join(UPLOADS_DIR, url.replace('/uploads/', ''))).catch(() => {});
}
