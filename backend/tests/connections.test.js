import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Connection } from '../src/models/Connection.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const send = (token, recipientId, source) =>
  api().post('/api/connections').set(bearer(token)).send({ recipientId, ...(source && { source }) });
const relation = async (token, userId) => (await api().get(`/api/users/${userId}`).set(bearer(token))).body.relation;

describe('connection requests', () => {
  it('sends, accepts and lists a connection', async () => {
    const a = await createUser({ name: 'Awa' });
    const b = await createUser({ name: 'Bakary' });

    const sent = await send(a.token, b.user.id, 'match');
    assert.equal(sent.status, 201);
    assert.equal(sent.body.relation.status, 'pending_outgoing');
    assert.equal((await relation(b.token, a.user.id)).status, 'pending_incoming');

    const requests = await api().get('/api/connections/requests').set(bearer(b.token));
    assert.equal(requests.body.incoming.length, 1);
    assert.equal(requests.body.incoming[0].user.name, 'Awa');
    assert.equal(requests.body.incoming[0].user.email, undefined);

    const accepted = await api().patch(`/api/connections/${sent.body.connection.id}`).set(bearer(b.token)).send({ action: 'accept' });
    assert.equal(accepted.status, 200);
    assert.equal((await relation(a.token, b.user.id)).status, 'connected');

    const network = await api().get('/api/connections').set(bearer(a.token));
    assert.deepEqual(network.body.connections.map((c) => c.user.name), ['Bakary']);
    assert.equal((await Connection.findOne()).source, 'match');
  });

  it('only lets the recipient respond', async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const sent = await send(a.token, b.user.id);
    for (const token of [a.token, c.token]) {
      const res = await api().patch(`/api/connections/${sent.body.connection.id}`).set(bearer(token)).send({ action: 'accept' });
      assert.equal(res.status, 404);
    }
  });

  it('turns a request back into an acceptance', async () => {
    const a = await createUser();
    const b = await createUser();
    await send(a.token, b.user.id);
    const res = await send(b.token, a.user.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.relation.status, 'connected');
    assert.equal(await Connection.countDocuments(), 1);
  });

  it('rejects duplicates, self-requests and hidden users', async () => {
    const a = await createUser();
    const b = await createUser();
    const admin = await createUser({ role: 'admin' });
    const banned = await createUser({ status: 'banned' });

    await send(a.token, b.user.id);
    assert.equal((await send(a.token, b.user.id)).status, 409);
    assert.equal((await send(a.token, a.user.id)).status, 400);
    assert.equal((await send(a.token, admin.user.id)).status, 404);
    assert.equal((await send(a.token, banned.user.id)).status, 404);
  });

  it('after a decline, shows "declined" only to the requester and blocks resending', async () => {
    const a = await createUser();
    const b = await createUser();
    const sent = await send(a.token, b.user.id);
    await api().patch(`/api/connections/${sent.body.connection.id}`).set(bearer(b.token)).send({ action: 'reject' });

    assert.equal((await relation(a.token, b.user.id)).status, 'declined');
    assert.equal((await relation(b.token, a.user.id)).status, 'none');
    assert.equal((await send(a.token, b.user.id)).status, 409);

    // The student who declined can still send their own request later.
    const reverse = await send(b.token, a.user.id);
    assert.equal(reverse.body.relation.status, 'pending_outgoing');
  });

  it('lets the requester cancel and either side remove a connection', async () => {
    const a = await createUser();
    const b = await createUser();
    const sent = await send(a.token, b.user.id);

    assert.equal((await api().delete(`/api/connections/${sent.body.connection.id}`).set(bearer(b.token))).status, 400);
    assert.equal((await api().delete(`/api/connections/${sent.body.connection.id}`).set(bearer(a.token))).status, 204);

    const again = await send(a.token, b.user.id);
    await api().patch(`/api/connections/${again.body.connection.id}`).set(bearer(b.token)).send({ action: 'accept' });
    assert.equal((await api().delete(`/api/connections/${again.body.connection.id}`).set(bearer(b.token))).status, 204);
    assert.equal((await relation(a.token, b.user.id)).status, 'none');
  });

  it('removes connected and requested students from matches', async () => {
    const profile = { interests: ['football'], goals: ['friendship'] };
    const me = await createUser(profile);
    const other = await createUser({ ...profile, name: 'Other' });
    const stranger = await createUser({ ...profile, name: 'Stranger' });

    await send(me.token, other.user.id);
    const res = await api().get('/api/matches').set(bearer(me.token));
    assert.deepEqual(res.body.matches.map((m) => m.user.name), ['Stranger']);
    assert.ok(stranger);
  });
});
