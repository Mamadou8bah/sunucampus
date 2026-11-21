import { Conversation, Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { pairKeyOf } from '../models/Connection.js';
import { ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { areConnected } from '../services/connections.js';
import { emitToUser } from '../realtime/socket.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';

const PARTICIPANT_FIELDS = 'name avatarUrl programme yearOfStudy status emailVerifiedAt';
const LISTING_FIELDS = 'title price photos status seller';

const participantJSON = (u) =>
  u && { id: u.id, name: u.name, avatarUrl: u.avatarUrl, programme: u.programme, yearOfStudy: u.yearOfStudy, isVerified: Boolean(u.emailVerifiedAt) };

const messageJSON = (m) => ({
  id: m.id,
  conversation: m.conversation.toString(),
  sender: m.sender.toString(),
  content: m.content,
  createdAt: m.createdAt,
  readAt: m.readAt ?? null,
});

const unreadFilter = (conversationId, userId) => ({ conversation: conversationId, sender: { $ne: userId }, readAt: null });

/** Loads a conversation the viewer takes part in. Admins cannot read others' messages. */
async function loadConversation(id, viewer) {
  const conversation = await Conversation.findById(id).populate('participants', PARTICIPANT_FIELDS);
  if (!conversation || !conversation.hasParticipant(viewer._id)) throw ApiError.notFound('Conversation not found');
  return conversation;
}

async function conversationJSON(conversation, viewer) {
  const other = conversation.otherParticipant(viewer._id);
  if (conversation.listing && !conversation.populated('listing')) await conversation.populate('listing', LISTING_FIELDS);
  const l = conversation.listing;
  return {
    id: conversation.id,
    otherUser: participantJSON(other),
    // The marketplace item this chat started from, if any.
    listing: l?.title
      ? { id: l.id, title: l.title, price: l.price, photo: l.photos?.[0] ?? null, status: l.status, isMine: Boolean(l.seller?.equals(viewer._id)) }
      : null,
    lastMessage: conversation.lastMessage?.createdAt
      ? {
          content: conversation.lastMessage.content,
          sender: conversation.lastMessage.sender.toString(),
          createdAt: conversation.lastMessage.createdAt,
        }
      : null,
    unreadCount: await Message.countDocuments(unreadFilter(conversation._id, viewer._id)),
    updatedAt: conversation.updatedAt,
  };
}

export async function list(req, res) {
  const conversations = await Conversation.find({ participants: req.user._id, 'lastMessage.createdAt': { $exists: true } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate('participants', PARTICIPANT_FIELDS);
  res.json({ conversations: await Promise.all(conversations.map((c) => conversationJSON(c, req.user))) });
}

/**
 * Opens (or creates) the conversation with another student. Allowed for connections, or
 * when `listingId` is an active marketplace listing of theirs (a buyer contacting a seller).
 */
export async function open(req, res) {
  const me = req.user;
  const { userId, listingId } = req.body;
  const other = await User.findById(userId);
  if (!other || other.status !== ACCOUNT_STATUS.ACTIVE || other._id.equals(me._id)) throw ApiError.notFound('User not found');

  let listing = null;
  if (listingId) {
    listing = await Listing.findById(listingId);
    if (!listing || listing.status !== LISTING_STATUS.ACTIVE || !listing.seller.equals(other._id)) {
      throw ApiError.badRequest('This item is no longer available');
    }
  } else if (!(await areConnected(me._id, other._id))) {
    throw ApiError.forbidden('You can only message your connections');
  }

  const pairKey = pairKeyOf(me._id, other._id);
  const conversation = await Conversation.findOneAndUpdate(
    { pairKey },
    {
      $setOnInsert: { pairKey, participants: [me._id, other._id] },
      // The latest item they talked about; it also allows messaging without a connection.
      ...(listing && { $set: { listing: listing._id } }),
    },
    { upsert: true, returnDocument: 'after' },
  ).populate('participants', PARTICIPANT_FIELDS);

  res.json({ conversation: await conversationJSON(conversation, me) });
}

export async function messages(req, res) {
  const conversation = await loadConversation(req.params.id, req.user);
  const { before, limit } = req.validated.query;
  const filter = { conversation: conversation._id };
  // Cursor on the message id: ObjectIds increase over time and, unlike timestamps, never tie.
  if (before) filter._id = { $lt: before };

  // Newest page first from the database, returned oldest-to-newest for display.
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  res.json({
    conversation: await conversationJSON(conversation, req.user),
    messages: rows.slice(0, limit).reverse().map(messageJSON),
    hasMore,
  });
}

export async function send(req, res) {
  const me = req.user;
  const conversation = await loadConversation(req.params.id, me);
  const other = conversation.otherParticipant(me._id);
  // Connections can always chat; a chat started from a marketplace listing can continue without one.
  const allowed = other.status === ACCOUNT_STATUS.ACTIVE && (conversation.listing || (await areConnected(me._id, other._id)));
  if (!allowed) throw ApiError.forbidden('You can only message your connections');

  const message = await Message.create({ conversation: conversation._id, sender: me._id, content: req.body.content });
  conversation.lastMessage = { content: message.content.slice(0, 200), sender: me._id, createdAt: message.createdAt };
  await conversation.save();

  const payload = messageJSON(message);
  // Push to the recipient and to the sender's other open tabs.
  emitToUser(other._id, 'message:new', payload);
  emitToUser(me._id, 'message:new', payload);
  res.status(201).json({ message: payload });
}

export async function markRead(req, res) {
  const conversation = await loadConversation(req.params.id, req.user);
  const readAt = new Date();
  const { modifiedCount } = await Message.updateMany(unreadFilter(conversation._id, req.user._id), { readAt });
  if (modifiedCount > 0) {
    const other = conversation.otherParticipant(req.user._id);
    emitToUser(other._id, 'conversation:read', { conversationId: conversation.id, readAt });
    emitToUser(req.user._id, 'conversation:read', { conversationId: conversation.id, readAt, byMe: true });
  }
  res.json({ read: modifiedCount });
}

export async function unreadTotal(req, res) {
  const conversations = await Conversation.find({ participants: req.user._id }).distinct('_id');
  const unread = await Message.countDocuments({ conversation: { $in: conversations }, sender: { $ne: req.user._id }, readAt: null });
  res.json({ unread });
}
