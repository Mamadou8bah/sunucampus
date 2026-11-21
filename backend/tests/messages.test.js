import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { io as connectClient } from 'socket.io-client';
import { setupDB, clearDB, teardownDB, api, app, createUser, bearer } from './helpers.js';
import { initSocket, closeSocket } from '../src/realtime/socket.js';

let server;
let baseUrl;

before(async () => {
  await setupDB();
  server = createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});
after(async () => {
  await closeSocket();
  await new Promise((resolve) => server.close(resolve));
  await teardownDB();
});
beforeEach(clearDB);

async function connectPair() {
  const a = await createUser({ name: 'Awa' });
  const b = await createUser({ name: 'Bakary' });
  const req = await api().post('/api/connections').set(bearer(a.token)).send({ recipientId: b.user.id });
  await api().patch(`/api/connections/${req.body.connection.id}`).set(bearer(b.token)).send({ action: 'accept' });
  return { a, b };
}

const open = (token, userId) => api().post('/api/conversations').set(bearer(token)).send({ userId });
const send = (token, id, content) => api().post(`/api/conversations/${id}/messages`).set(bearer(token)).send({ content });

function socketFor(token) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const nextEvent = (socket, event, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${event} event`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe('conversations', () => {
  it('only connected students can start a conversation', async () => {
    const a = await createUser();
    const stranger = await createUser();
    assert.equal((await open(a.token, stranger.user.id)).status, 403);
  });

  it('opens the same conversation from either side', async () => {
    const { a, b } = await connectPair();
    const first = await open(a.token, b.user.id);
    const second = await open(b.token, a.user.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.conversation.id, second.body.conversation.id);
    assert.equal(first.body.conversation.otherUser.name, 'Bakary');
  });

  it('sends messages, tracks unread counts and marks them read', async () => {
    const { a, b } = await connectPair();
    const { body } = await open(a.token, b.user.id);
    const id = body.conversation.id;

    await send(a.token, id, 'Hi Bakary');
    await send(a.token, id, 'Want to study together?');

    const unread = await api().get('/api/conversations/unread').set(bearer(b.token));
    assert.equal(unread.body.unread, 2);

    const list = await api().get('/api/conversations').set(bearer(b.token));
    assert.equal(list.body.conversations[0].unreadCount, 2);
    assert.equal(list.body.conversations[0].lastMessage.content, 'Want to study together?');

    const history = await api().get(`/api/conversations/${id}/messages`).set(bearer(b.token));
    assert.deepEqual(history.body.messages.map((m) => m.content), ['Hi Bakary', 'Want to study together?']);

    await api().post(`/api/conversations/${id}/read`).set(bearer(b.token));
    assert.equal((await api().get('/api/conversations/unread').set(bearer(b.token))).body.unread, 0);
    // The sender's own messages never count as unread for them.
    assert.equal((await api().get('/api/conversations/unread').set(bearer(a.token))).body.unread, 0);
  });

  it('paginates older messages', async () => {
    const { a, b } = await connectPair();
    const { body } = await open(a.token, b.user.id);
    for (let i = 1; i <= 5; i += 1) await send(a.token, body.conversation.id, `m${i}`);

    const page1 = await api().get(`/api/conversations/${body.conversation.id}/messages?limit=2`).set(bearer(a.token));
    assert.deepEqual(page1.body.messages.map((m) => m.content), ['m4', 'm5']);
    assert.equal(page1.body.hasMore, true);

    const before = page1.body.messages[0].id;
    const page2 = await api().get(`/api/conversations/${body.conversation.id}/messages`).query({ limit: 10, before }).set(bearer(a.token));
    assert.deepEqual(page2.body.messages.map((m) => m.content), ['m1', 'm2', 'm3']);
    assert.equal(page2.body.hasMore, false);
  });

  it('keeps conversations private, even from admins', async () => {
    const { a, b } = await connectPair();
    const admin = await createUser({ role: 'admin' });
    const outsider = await createUser();
    const { body } = await open(a.token, b.user.id);
    for (const token of [admin.token, outsider.token]) {
      assert.equal((await api().get(`/api/conversations/${body.conversation.id}/messages`).set(bearer(token))).status, 404);
      assert.equal((await send(token, body.conversation.id, 'hello')).status, 404);
    }
  });

  it('stops messaging once the connection is removed', async () => {
    const { a, b } = await connectPair();
    const { body } = await open(a.token, b.user.id);
    const network = await api().get('/api/connections').set(bearer(a.token));
    await api().delete(`/api/connections/${network.body.connections[0].id}`).set(bearer(a.token));
    assert.equal((await send(a.token, body.conversation.id, 'Still there?')).status, 403);
  });
});

describe('real-time delivery', () => {
  it('shares online status only with connections', async () => {
    const { a, b } = await connectPair();
    const stranger = await createUser();
    const socketA = await socketFor(a.token);
    try {
      const cameOnline = nextEvent(socketA, 'presence');
      const socketB = await socketFor(b.token);
      assert.deepEqual(await cameOnline, { userId: b.user.id, online: true });

      const ask = (socket, ids) => new Promise((resolve) => socket.emit('presence:query', ids, resolve));
      assert.deepEqual(await ask(socketA, [b.user.id, stranger.user.id]), [b.user.id]);

      // A stranger can't learn that b is online.
      const socketS = await socketFor(stranger.token);
      assert.deepEqual(await ask(socketS, [b.user.id]), []);
      socketS.close();

      const wentOffline = nextEvent(socketA, 'presence');
      socketB.close();
      assert.deepEqual(await wentOffline, { userId: b.user.id, online: false });
    } finally {
      socketA.close();
    }
  });

  it('rejects sockets without a valid token', async () => {
    await assert.rejects(socketFor('not-a-token'), /unauthorized/);
  });

  it('pushes new messages, typing and read receipts to the other participant', async () => {
    const { a, b } = await connectPair();
    const { body } = await open(a.token, b.user.id);
    const id = body.conversation.id;
    const [socketA, socketB] = await Promise.all([socketFor(a.token), socketFor(b.token)]);

    try {
      const typing = nextEvent(socketB, 'typing');
      socketA.emit('typing', { conversationId: id, isTyping: true });
      assert.deepEqual(await typing, { conversationId: id, userId: a.user.id, isTyping: true });

      const incoming = nextEvent(socketB, 'message:new');
      await send(a.token, id, 'Real-time hello');
      const message = await incoming;
      assert.equal(message.content, 'Real-time hello');
      assert.equal(message.conversation, id);

      const receipt = nextEvent(socketA, 'conversation:read');
      await api().post(`/api/conversations/${id}/read`).set(bearer(b.token));
      assert.equal((await receipt).conversationId, id);
    } finally {
      socketA.close();
      socketB.close();
    }
  });
});
