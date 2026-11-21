import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';

// tests/setup.js points UPLOADS_DIR at a temporary folder.
const dir = process.env.UPLOADS_DIR;

before(setupDB);
after(async () => {
  await teardownDB();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(clearDB);

// Smallest valid PNG: 1×1 transparent pixel.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f6a0000000049454e44ae426082',
  'hex',
);

describe('profile photos', () => {
  it('uploads a photo, serves it, and replaces the old file', async () => {
    const { token } = await createUser();
    const first = await api().put('/api/users/me/avatar').set(bearer(token)).attach('photo', PNG, 'me.png');
    assert.equal(first.status, 200);
    assert.match(first.body.user.avatarUrl, /^\/uploads\/avatars\/.+\.png$/);

    assert.equal(existsSync(join(dir, first.body.user.avatarUrl.replace('/uploads/', ''))), true);
    const served = await api().get(first.body.user.avatarUrl);
    assert.equal(served.status, 200);
    assert.match(served.headers['content-type'], /image\/png/);

    await new Promise((r) => setTimeout(r, 5));
    const second = await api().put('/api/users/me/avatar').set(bearer(token)).attach('photo', PNG, 'new.png');
    assert.notEqual(second.body.user.avatarUrl, first.body.user.avatarUrl);
    assert.equal(existsSync(join(dir, first.body.user.avatarUrl.replace('/uploads/', ''))), false);
  });

  it('rejects files that are not images, whatever their name says', async () => {
    const { token } = await createUser();
    const res = await api().put('/api/users/me/avatar').set(bearer(token)).attach('photo', Buffer.from('<script>alert(1)</script>'), 'evil.png');
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /JPG, PNG or WebP/);
  });

  it('rejects photos over 3 MB', async () => {
    const { token } = await createUser();
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await api().put('/api/users/me/avatar').set(bearer(token)).attach('photo', big, 'big.png');
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /3 MB/);
  });

  it('removes a photo', async () => {
    const { token } = await createUser();
    const up = await api().put('/api/users/me/avatar').set(bearer(token)).attach('photo', PNG, 'me.png');
    const res = await api().delete('/api/users/me/avatar').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.avatarUrl, undefined);
    assert.equal(existsSync(join(dir, up.body.user.avatarUrl.replace('/uploads/', ''))), false);
  });

  it('requires authentication', async () => {
    assert.equal((await api().put('/api/users/me/avatar').attach('photo', PNG, 'me.png')).status, 401);
  });
});
