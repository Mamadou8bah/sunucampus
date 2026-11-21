import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { AuditLog } from '../src/models/AuditLog.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

describe('admin route authorization', () => {
  it('rejects anonymous requests', async () => {
    const res = await api().get('/api/admin/users');
    assert.equal(res.status, 401);
  });

  for (const role of ['student', 'moderator']) {
    it(`forbids a ${role}`, async () => {
      const { token } = await createUser({ role });
      const res = await api().get('/api/admin/users').set(bearer(token));
      assert.equal(res.status, 403);
    });
  }

  it('allows an admin', async () => {
    const { token } = await createUser({ role: 'admin' });
    const res = await api().get('/api/admin/users').set(bearer(token));
    assert.equal(res.status, 200);
  });

  it('takes effect immediately when an admin is demoted', async () => {
    const { token: adminToken } = await createUser({ role: 'admin' });
    const { user: other, token: otherToken } = await createUser({ role: 'admin' });

    await api().patch(`/api/admin/users/${other.id}/role`).set(bearer(adminToken)).send({ role: 'student' });

    const res = await api().get('/api/admin/users').set(bearer(otherToken));
    assert.equal(res.status, 403);
  });
});

describe('GET /api/admin/users', () => {
  it('searches, filters and paginates', async () => {
    const { token } = await createUser({ role: 'admin' });
    await createUser({ name: 'Fatou Ceesay', programme: 'Computer Science' });
    await createUser({ name: 'Lamin Touray', programme: 'Economics', status: 'suspended' });
    await createUser({ name: 'Isatou Sowe', programme: 'Computer Science' });

    const search = await api().get('/api/admin/users?q=computer').set(bearer(token));
    assert.equal(search.body.total, 2);

    const suspended = await api().get('/api/admin/users?status=suspended').set(bearer(token));
    assert.deepEqual(suspended.body.users.map((u) => u.name), ['Lamin Touray']);

    const paged = await api().get('/api/admin/users?limit=2&page=2').set(bearer(token));
    assert.equal(paged.body.total, 4);
    assert.equal(paged.body.users.length, 2);
    assert.equal(paged.body.totalPages, 2);
  });

  it('treats search text literally, not as a regex', async () => {
    const { token } = await createUser({ role: 'admin' });
    const res = await api().get('/api/admin/users?q=.*').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });

  it('validates query parameters', async () => {
    const { token } = await createUser({ role: 'admin' });
    const res = await api().get('/api/admin/users?role=superuser').set(bearer(token));
    assert.equal(res.status, 400);
  });
});

describe('PATCH /api/admin/users/:id/role and /status', () => {
  it('changes a role and writes an audit log', async () => {
    const { user: admin, token } = await createUser({ role: 'admin' });
    const { user } = await createUser();

    const res = await api().patch(`/api/admin/users/${user.id}/role`).set(bearer(token)).send({ role: 'moderator' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'moderator');

    const log = await AuditLog.findOne({ action: 'user.role_changed' });
    assert.equal(log.actor.toString(), admin.id);
    assert.deepEqual(log.details, { from: 'student', to: 'moderator' });
  });

  it('suspends a user, which blocks their login, then reactivates them', async () => {
    const { token } = await createUser({ role: 'admin' });
    const { user, password } = await createUser();

    const suspend = await api()
      .patch(`/api/admin/users/${user.id}/status`)
      .set(bearer(token))
      .send({ status: 'suspended', reason: 'Harassment' });
    assert.equal(suspend.status, 200);
    assert.equal(suspend.body.user.statusReason, 'Harassment');

    const blocked = await api().post('/api/auth/login').send({ email: user.email, password });
    assert.equal(blocked.status, 403);

    const reactivate = await api().patch(`/api/admin/users/${user.id}/status`).set(bearer(token)).send({ status: 'active' });
    assert.equal(reactivate.body.user.statusReason, undefined);

    const allowed = await api().post('/api/auth/login').send({ email: user.email, password });
    assert.equal(allowed.status, 200);
  });

  it('stops an admin from demoting or suspending themselves', async () => {
    const { user, token } = await createUser({ role: 'admin' });
    await createUser({ role: 'admin' });

    const demote = await api().patch(`/api/admin/users/${user.id}/role`).set(bearer(token)).send({ role: 'student' });
    assert.equal(demote.status, 400);

    const suspend = await api().patch(`/api/admin/users/${user.id}/status`).set(bearer(token)).send({ status: 'banned' });
    assert.equal(suspend.status, 400);
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const { token } = await createUser({ role: 'admin' });
    const missing = await api()
      .patch('/api/admin/users/64b7f0000000000000000000/role')
      .set(bearer(token))
      .send({ role: 'student' });
    assert.equal(missing.status, 404);

    const malformed = await api().get('/api/admin/users/not-an-id').set(bearer(token));
    assert.equal(malformed.status, 400);
  });
});

describe('GET /api/admin/audit-logs', () => {
  it('lists actions newest first with the acting admin', async () => {
    const { token } = await createUser({ role: 'admin', name: 'Admin One' });
    const { user } = await createUser();
    await api().patch(`/api/admin/users/${user.id}/role`).set(bearer(token)).send({ role: 'moderator' });
    await api().patch(`/api/admin/users/${user.id}/status`).set(bearer(token)).send({ status: 'suspended' });

    const res = await api().get('/api/admin/audit-logs').set(bearer(token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.logs.map((l) => l.action), ['user.status_changed', 'user.role_changed']);
    assert.equal(res.body.logs[0].actor.name, 'Admin One');
    assert.equal(res.body.logs[0].actor.password, undefined);
  });
});
