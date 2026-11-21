import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { User } from '../src/models/User.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const request = (token, body = {}) => api().post('/api/auth/verify-email/request').set(bearer(token)).send(body);
const confirm = (token, code) => api().post('/api/auth/verify-email/confirm').set(bearer(token)).send({ code });

describe('UTG email verification (blue tick)', () => {
  it('verifies a UTG sign-up email with the emailed code', async () => {
    const { token, user } = await createUser({ email: 'awa.jallow@utg.edu.gm' });
    const sent = await request(token);
    assert.equal(sent.status, 200);
    assert.equal(sent.body.sentTo, 'aw•••@utg.edu.gm');
    assert.match(sent.body.devCode, /^\d{6}$/);

    const res = await confirm(token, sent.body.devCode);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.isVerified, true);
    assert.equal(res.body.user.emailVerification, undefined);

    // Other students see the tick on the public profile.
    const other = await createUser();
    const profile = await api().get(`/api/users/${user.id}`).set(bearer(other.token));
    assert.equal(profile.body.user.isVerified, true);
  });

  it('refuses non-UTG addresses', async () => {
    const { token } = await createUser({ email: 'someone@gmail.com' });
    const res = await request(token);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /@utg\.edu\.gm/);
  });

  it('lets a student verify a different UTG address, which becomes their email', async () => {
    const { token, user } = await createUser({ email: 'lamin@gmail.com' });
    const sent = await request(token, { email: 'Lamin.Touray@utg.edu.gm' });
    await confirm(token, sent.body.devCode);
    const updated = await User.findById(user.id);
    assert.equal(updated.email, 'lamin.touray@utg.edu.gm');
    assert.ok(updated.emailVerifiedAt);
  });

  it('will not take over an address another account uses', async () => {
    await createUser({ email: 'taken@utg.edu.gm' });
    const { token } = await createUser({ email: 'me@gmail.com' });
    assert.equal((await request(token, { email: 'taken@utg.edu.gm' })).status, 409);
  });

  it('rejects wrong codes and locks after five attempts', async () => {
    const { token } = await createUser({ email: 'binta@utg.edu.gm' });
    const sent = await request(token);
    const wrong = sent.body.devCode === '000000' ? '111111' : '000000';

    const first = await confirm(token, wrong);
    assert.equal(first.status, 400);
    assert.match(first.body.error.message, /4 tries left/);
    for (let i = 0; i < 4; i += 1) await confirm(token, wrong);

    const locked = await confirm(token, sent.body.devCode);
    assert.equal(locked.status, 400);
    assert.match(locked.body.error.message, /Ask for a new one/);
  });

  it('rejects an expired code', async () => {
    const { token, user } = await createUser({ email: 'musa@utg.edu.gm' });
    const sent = await request(token);
    await User.updateOne({ _id: user.id }, { 'emailVerification.expiresAt': new Date(Date.now() - 1000) });
    const res = await confirm(token, sent.body.devCode);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /expired/);
  });

  it('shows the tick on posts', async () => {
    const { token } = await createUser({ email: 'fatou@utg.edu.gm', emailVerifiedAt: new Date() });
    const res = await api().post('/api/posts').set(bearer(token)).send({ content: 'Hello' });
    assert.equal(res.body.post.author.isVerified, true);
  });
});
