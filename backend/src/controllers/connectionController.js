import { Connection, CONNECTION_STATUS, pairKeyOf } from '../models/Connection.js';
import { User } from '../models/User.js';
import { ROLES, ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { relationFor } from '../services/connections.js';
import { notify } from '../services/notifications.js';

const PUBLIC_USER_FIELDS = 'name role programme yearOfStudy avatarUrl interests skills goals emailVerifiedAt';

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  programme: u.programme,
  yearOfStudy: u.yearOfStudy,
  avatarUrl: u.avatarUrl,
  interests: u.interests,
  skills: u.skills,
  goals: u.goals,
  isVerified: Boolean(u.emailVerifiedAt),
});

export async function sendRequest(req, res) {
  const me = req.user;
  const { recipientId, source } = req.body;
  if (recipientId === me.id) throw ApiError.badRequest('You cannot connect with yourself');

  const recipient = await User.findById(recipientId);
  if (!recipient || recipient.status !== ACCOUNT_STATUS.ACTIVE || recipient.role === ROLES.ADMIN) {
    throw ApiError.notFound('User not found');
  }

  const existing = await Connection.findOne({ pairKey: pairKeyOf(me._id, recipient._id) });

  if (!existing) {
    const connection = await Connection.create({
      requester: me._id,
      recipient: recipient._id,
      pairKey: pairKeyOf(me._id, recipient._id),
      source,
    });
    await notify({ recipient: recipient._id, actor: me._id, type: 'connection_request' });
    return res.status(201).json({ connection, relation: relationFor(connection, me._id) });
  }

  const relation = relationFor(existing, me._id);
  switch (relation.status) {
    case 'connected':
      throw ApiError.conflict('You are already connected');
    case 'pending_outgoing':
      throw ApiError.conflict('You already sent a request');
    case 'declined':
      throw ApiError.conflict('You can’t send another request to this student yet');
    case 'pending_incoming':
      // They already asked me: sending back counts as accepting.
      existing.status = CONNECTION_STATUS.ACCEPTED;
      existing.respondedAt = new Date();
      break;
    default:
      // A previous request was declined and may be sent again.
      existing.requester = me._id;
      existing.recipient = recipient._id;
      existing.status = CONNECTION_STATUS.PENDING;
      existing.source = source;
      existing.respondedAt = undefined;
  }
  await existing.save();
  await notify({
    recipient: recipient._id,
    actor: me._id,
    type: existing.status === CONNECTION_STATUS.ACCEPTED ? 'connection_accepted' : 'connection_request',
  });
  res.status(200).json({ connection: existing, relation: relationFor(existing, me._id) });
}

export async function respond(req, res) {
  const connection = await Connection.findById(req.params.id);
  if (!connection || !connection.recipient.equals(req.user._id)) throw ApiError.notFound('Request not found');
  if (connection.status !== CONNECTION_STATUS.PENDING) throw ApiError.conflict('This request has already been answered');

  connection.status = req.body.action === 'accept' ? CONNECTION_STATUS.ACCEPTED : CONNECTION_STATUS.REJECTED;
  connection.respondedAt = new Date();
  await connection.save();
  if (connection.status === CONNECTION_STATUS.ACCEPTED) {
    await notify({ recipient: connection.requester, actor: req.user._id, type: 'connection_accepted' });
  }
  res.json({ connection, relation: relationFor(connection, req.user._id) });
}

/** Cancels my pending request, or removes an existing connection. */
export async function remove(req, res) {
  const me = req.user._id;
  const connection = await Connection.findById(req.params.id);
  const involved = connection && (connection.requester.equals(me) || connection.recipient.equals(me));
  if (!involved) throw ApiError.notFound('Connection not found');

  const canCancel = connection.status === CONNECTION_STATUS.PENDING && connection.requester.equals(me);
  const canRemove = connection.status === CONNECTION_STATUS.ACCEPTED;
  if (!canCancel && !canRemove) throw ApiError.badRequest('This connection cannot be removed');

  await connection.deleteOne();
  res.status(204).end();
}

export async function listConnections(req, res) {
  const me = req.user._id;
  const rows = await Connection.find({
    status: CONNECTION_STATUS.ACCEPTED,
    $or: [{ requester: me }, { recipient: me }],
  })
    .sort({ respondedAt: -1 })
    .populate('requester recipient', PUBLIC_USER_FIELDS);

  res.json({
    connections: rows.map((c) => ({
      id: c.id,
      since: c.respondedAt,
      user: publicUser(c.requester.equals(me) ? c.recipient : c.requester),
    })),
  });
}

export async function listRequests(req, res) {
  const me = req.user._id;
  const [incoming, outgoing] = await Promise.all([
    Connection.find({ recipient: me, status: CONNECTION_STATUS.PENDING }).sort({ createdAt: -1 }).populate('requester', PUBLIC_USER_FIELDS),
    Connection.find({ requester: me, status: CONNECTION_STATUS.PENDING }).sort({ createdAt: -1 }).populate('recipient', PUBLIC_USER_FIELDS),
  ]);

  res.json({
    incoming: incoming.map((c) => ({ id: c.id, createdAt: c.createdAt, user: publicUser(c.requester) })),
    outgoing: outgoing.map((c) => ({ id: c.id, createdAt: c.createdAt, user: publicUser(c.recipient) })),
  });
}
