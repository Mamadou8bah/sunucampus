import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Community } from '../src/models/Community.js';
import { User } from '../src/models/User.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const createCommunity = (token, body = {}) =>
  api().post('/api/communities').set(bearer(token)).send({ name: 'UTG Coders', category: 'technology', ...body });

/** Creates a community and activates it, as an admin approval would. */
async function activeCommunity(token, body) {
  const res = await createCommunity(token, body);
  await Community.updateOne({ _id: res.body.community.id }, { status: 'active' });
  return res.body.community;
}

describe('creating communities', () => {
  it('creates a pending community with the creator as member and moderator', async () => {
    const { token } = await createUser();
    const res = await createCommunity(token, { description: 'For anyone who codes' });
    assert.equal(res.status, 201);
    assert.equal(res.body.community.status, 'pending');
    assert.equal(res.body.community.slug, 'utg-coders');
    assert.equal(res.body.community.memberCount, 1);
    assert.equal(res.body.community.isMember, true);
    assert.equal(res.body.community.canModerate, true);
  });

  it('auto-approves communities created by admins', async () => {
    const { token } = await createUser({ role: 'admin' });
    const res = await createCommunity(token);
    assert.equal(res.body.community.status, 'active');
  });

  it('rejects duplicate names regardless of case and punctuation', async () => {
    const { token } = await createUser();
    await createCommunity(token);
    assert.equal((await createCommunity(token, { name: 'utg   CODERS!' })).status, 409);
  });

  it('hides pending communities from other students', async () => {
    const owner = await createUser();
    const other = await createUser();
    const { body } = await createCommunity(owner.token);

    assert.equal((await api().get(`/api/communities/${body.community.slug}`).set(bearer(owner.token))).status, 200);
    assert.equal((await api().get(`/api/communities/${body.community.slug}`).set(bearer(other.token))).status, 404);
    const list = await api().get('/api/communities').set(bearer(other.token));
    assert.equal(list.body.total, 0);
    const mine = await api().get('/api/communities?mine=true').set(bearer(owner.token));
    assert.equal(mine.body.total, 1);
  });
});

describe('membership', () => {
  it('joins once, leaves, and keeps an accurate member count', async () => {
    const owner = await createUser();
    const student = await createUser();
    const community = await activeCommunity(owner.token);

    await api().post(`/api/communities/${community.id}/join`).set(bearer(student.token));
    const twice = await api().post(`/api/communities/${community.id}/join`).set(bearer(student.token));
    assert.equal(twice.body.community.memberCount, 2);
    assert.equal(twice.body.community.isMember, true);

    const left = await api().post(`/api/communities/${community.id}/leave`).set(bearer(student.token));
    assert.equal(left.body.community.memberCount, 1);
    assert.equal(left.body.community.isMember, false);
  });

  it('cannot join a pending community', async () => {
    const owner = await createUser();
    const admin = await createUser({ role: 'admin' });
    const { body } = await createCommunity(owner.token);
    const res = await api().post(`/api/communities/${body.community.id}/join`).set(bearer(admin.token));
    assert.equal(res.status, 400);
  });

  it('stops the only moderator leaving while others remain', async () => {
    const owner = await createUser();
    const student = await createUser();
    const community = await activeCommunity(owner.token);
    await api().post(`/api/communities/${community.id}/join`).set(bearer(student.token));
    const res = await api().post(`/api/communities/${community.id}/leave`).set(bearer(owner.token));
    assert.equal(res.status, 400);
  });
});

describe('community moderation', () => {
  it('lets moderators edit details and appoint members as moderators', async () => {
    const owner = await createUser();
    const student = await createUser();
    const outsider = await createUser();
    const community = await activeCommunity(owner.token);
    await api().post(`/api/communities/${community.id}/join`).set(bearer(student.token));

    const edit = await api().patch(`/api/communities/${community.id}`).set(bearer(student.token)).send({ description: 'Hacked' });
    assert.equal(edit.status, 403);

    const notMember = await api().post(`/api/communities/${community.id}/moderators`).set(bearer(owner.token)).send({ userId: outsider.user.id });
    assert.equal(notMember.status, 400);

    const appoint = await api().post(`/api/communities/${community.id}/moderators`).set(bearer(owner.token)).send({ userId: student.user.id });
    assert.equal(appoint.status, 200);
    assert.equal((await User.findById(student.user.id)).role, 'moderator');

    const edit2 = await api().patch(`/api/communities/${community.id}`).set(bearer(student.token)).send({ description: 'Updated' });
    assert.equal(edit2.status, 200);
    assert.equal(edit2.body.community.description, 'Updated');
  });

  it('keeps at least one moderator', async () => {
    const owner = await createUser();
    const community = await activeCommunity(owner.token);
    const res = await api().delete(`/api/communities/${community.id}/moderators/${owner.user.id}`).set(bearer(owner.token));
    assert.equal(res.status, 400);
  });
});
