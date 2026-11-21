import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { User } from '../src/models/User.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

describe('POST /api/auth/register', () => {
  it('creates a student account and returns a token without the password', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Awa Jallow', email: 'Awa@Test.local', password: 'Password123' });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'awa@test.local');
    assert.equal(res.body.user.role, 'student');
    assert.equal(res.body.user.password, undefined);

    const stored = await User.findOne({ email: 'awa@test.local' }).select('+password');
    assert.notEqual(stored.password, 'Password123');
  });

  it('ignores a role sent by the client', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@test.local', password: 'Password123', role: 'admin' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'student');
  });

  it('rejects weak passwords and invalid emails', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'A B', email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
    const fields = res.body.error.details.map((d) => d.field);
    assert.ok(fields.includes('email'));
    assert.ok(fields.includes('password'));
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'dup@test.local' });
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'dup@test.local', password: 'Password123' });
    assert.equal(res.status, 409);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const { user, password } = await createUser();
    const res = await api().post('/api/auth/login').send({ email: user.email, password });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    const { user } = await createUser();
    const wrong = await api().post('/api/auth/login').send({ email: user.email, password: 'Wrong12345' });
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@test.local', password: 'Wrong12345' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it('blocks suspended and banned accounts', async () => {
    const { user, password } = await createUser({ status: 'suspended', statusReason: 'Spam' });
    const res = await api().post('/api/auth/login').send({ email: user.email, password });
    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /suspended: Spam/);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await api().get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects a tampered token', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/auth/me').set(bearer(`${token}x`));
    assert.equal(res.status, 401);
  });

  it('returns the current user', async () => {
    const { user, token } = await createUser();
    const res = await api().get('/api/auth/me').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
  });

  it('rejects an existing token once the account is suspended', async () => {
    const { user, token } = await createUser();
    await User.updateOne({ _id: user._id }, { status: 'suspended' });
    const res = await api().get('/api/auth/me').set(bearer(token));
    assert.equal(res.status, 403);
  });
});

describe('PATCH /api/auth/password', () => {
  it('changes the password and invalidates older tokens', async () => {
    const { token, password } = await createUser();
    // JWT iat has 1-second resolution; wait so the new token is clearly newer.
    await new Promise((r) => setTimeout(r, 1100));

    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: password, newPassword: 'NewPassword456' });
    assert.equal(res.status, 200);

    const oldToken = await api().get('/api/auth/me').set(bearer(token));
    assert.equal(oldToken.status, 401);
    const newToken = await api().get('/api/auth/me').set(bearer(res.body.token));
    assert.equal(newToken.status, 200);
  });

  it('requires the correct current password', async () => {
    const { token } = await createUser();
    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: 'Wrong12345', newPassword: 'NewPassword456' });
    assert.equal(res.status, 400);
  });
});
