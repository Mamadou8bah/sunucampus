// Demo ports of the messaging, marketplace, notification and report routes.
// Mirrors backend/src/controllers/{messageController,listingController,reportController}.js,
// backend/src/routes/notifications.js and the zod schemas next to them.
import { z } from 'zod';
import {
  byId,
  db,
  emitToUser,
  fileToDataUrl,
  findAll,
  findOne,
  forbidden,
  badRequest,
  insert,
  notFound,
  nowISO,
  register,
  respond,
  sameId,
  save,
  update,
  validate,
} from '../core.js';
import { areConnected, isAdmin, pairKeyOf, serializeNotification, unreadCount } from '../shared.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/* ================================ Messaging ================================ */

const openSchema = z.object({ userId: objectId, listingId: objectId.optional() });
const sendSchema = z.object({
  content: z.string().trim().min(1, 'Write a message first').max(2000, 'Messages can be at most 2000 characters'),
});
const messagesQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const participantJSON = (u) =>
  u && { id: u._id, name: u.name, avatarUrl: u.avatarUrl, programme: u.programme, yearOfStudy: u.yearOfStudy, isVerified: Boolean(u.emailVerifiedAt) };

const messageJSON = (m) => ({
  id: m._id,
  conversation: String(m.conversation),
  sender: String(m.sender),
  content: m.content,
  createdAt: m.createdAt,
  readAt: m.readAt ?? null,
});

const isUnreadFor = (conversationId, userId) => (m) => sameId(m.conversation, conversationId) && !sameId(m.sender, userId) && !m.readAt;
const hasParticipant = (c, userId) => c.participants.some((p) => sameId(p, userId));
const otherParticipantId = (c, userId) => c.participants.find((p) => !sameId(p, userId));

function loadConversation(id, viewer) {
  const conversation = byId('conversations', id);
  if (!conversation || !hasParticipant(conversation, viewer._id)) throw notFound('Conversation not found');
  return conversation;
}

function conversationJSON(conversation, viewer) {
  const other = byId('users', otherParticipantId(conversation, viewer._id));
  const l = conversation.listing ? byId('listings', conversation.listing) : null;
  return {
    id: conversation._id,
    otherUser: participantJSON(other),
    listing: l?.title
      ? { id: l._id, title: l.title, price: l.price, photo: l.photos?.[0] ?? null, status: l.status, isMine: sameId(l.seller, viewer._id) }
      : null,
    lastMessage: conversation.lastMessage?.createdAt
      ? { content: conversation.lastMessage.content, sender: String(conversation.lastMessage.sender), createdAt: conversation.lastMessage.createdAt }
      : null,
    unreadCount: db.messages.filter(isUnreadFor(conversation._id, viewer._id)).length,
    updatedAt: conversation.updatedAt,
  };
}

/** Creates a message like Message.create + conversation.save in the backend, and emits message:new. */
function createMessage(conversation, senderId, content) {
  const message = insert('messages', { conversation: conversation._id, sender: String(senderId), content, readAt: null });
  delete message.updatedAt; // messages only have createdAt
  update(conversation, { lastMessage: { content: message.content.slice(0, 200), sender: String(senderId), createdAt: message.createdAt } });
  const payload = messageJSON(message);
  for (const p of conversation.participants) emitToUser(p, 'message:new', payload);
  return payload;
}

/* ---- Demo extra: other students answer the visitor's first few messages ---- */

const MAX_REPLIES = 3;
const replyCounts = new Map(); // conversationId -> replies sent this page load
const pendingReplies = new Set();

const FRIENDLY_REPLIES = [
  'Hey! Good to hear from you 😊',
  'Sounds good to me!',
  'Haha yes, totally agree.',
  "Sure, let's do that. When works for you?",
  'Thanks for the message! I was just thinking about that.',
  'Nice! See you on campus then.',
  "I'm in the library right now, can we talk later today?",
  "That would be great, count me in!",
  'Good luck with your exams this week 🙌',
];
const SELLER_REPLIES = [
  "Hi! Yes, it's still available!",
  'We can meet at the library tomorrow if that works for you.',
  'The price is a little negotiable 🙂',
  "It's in great condition, I can send more photos.",
  'I can bring it to campus after my 2pm lecture.',
  "Deal! Let me know when you're free.",
];
const BUYER_REPLIES = [
  "Great, I'm interested! Is the price negotiable?",
  'Can we meet at the main gate tomorrow?',
  'Perfect, thanks! I will bring cash.',
  'Is it still in good condition?',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function scheduleReply(conversationId, visitorId) {
  const conversation = byId('conversations', conversationId);
  if (!conversation || pendingReplies.has(conversationId)) return;
  const count = replyCounts.get(conversationId) ?? 0;
  if (count >= MAX_REPLIES) return;
  const otherId = otherParticipantId(conversation, visitorId);
  const other = byId('users', otherId);
  if (!other || other.status !== 'active' || isAdmin(other)) return;

  replyCounts.set(conversationId, count + 1);
  pendingReplies.add(conversationId);

  setTimeout(() => {
    try {
      // They open the chat: the visitor's messages are read, then they start typing.
      const readAt = nowISO();
      let read = 0;
      for (const m of db.messages) {
        if (isUnreadFor(conversationId, otherId)(m)) {
          m.readAt = readAt;
          read += 1;
        }
      }
      if (read) {
        save();
        emitToUser(visitorId, 'conversation:read', { conversationId, readAt });
      }
      emitToUser(visitorId, 'typing', { conversationId, userId: String(otherId), isTyping: true });
    } catch (err) {
      console.error('[demo] reply failed', err);
    }

    setTimeout(() => {
      pendingReplies.delete(conversationId);
      try {
        const conv = byId('conversations', conversationId);
        emitToUser(visitorId, 'typing', { conversationId, userId: String(otherId), isTyping: false });
        if (!conv) return;
        const listing = conv.listing ? byId('listings', conv.listing) : null;
        let pool = FRIENDLY_REPLIES;
        if (listing) pool = sameId(listing.seller, otherId) ? SELLER_REPLIES : BUYER_REPLIES;
        createMessage(conv, otherId, pick(pool));
      } catch (err) {
        console.error('[demo] reply failed', err);
      }
    }, 2000 + Math.random() * 1000);
  }, 1500);
}

register([
  [
    'GET',
    '/conversations',
    ({ me }) => {
      const conversations = findAll('conversations', (c) => hasParticipant(c, me._id) && c.lastMessage?.createdAt)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
        .slice(0, 50);
      return { conversations: conversations.map((c) => conversationJSON(c, me)) };
    },
  ],
  [
    'GET',
    '/conversations/unread',
    ({ me }) => {
      const ids = new Set(findAll('conversations', (c) => hasParticipant(c, me._id)).map((c) => c._id));
      const unread = db.messages.filter((m) => ids.has(String(m.conversation)) && !sameId(m.sender, me._id) && !m.readAt).length;
      return { unread };
    },
  ],
  [
    'POST',
    '/conversations',
    ({ me, body }) => {
      const { userId, listingId } = validate(openSchema, body);
      const other = byId('users', userId);
      if (!other || other.status !== 'active' || sameId(other._id, me._id)) throw notFound('User not found');

      let listing = null;
      if (listingId) {
        listing = byId('listings', listingId);
        if (!listing || listing.status !== 'active' || !sameId(listing.seller, other._id)) throw badRequest('This item is no longer available');
      } else if (!areConnected(me._id, other._id)) {
        throw forbidden('You can only message your connections');
      }

      const pairKey = pairKeyOf(me._id, other._id);
      let conversation = findOne('conversations', (c) => c.pairKey === pairKey);
      if (!conversation) {
        conversation = insert('conversations', { pairKey, participants: [String(me._id), String(other._id)], ...(listing && { listing: listing._id }) });
      } else {
        // findOneAndUpdate bumps updatedAt in the backend too.
        update(conversation, listing ? { listing: listing._id } : {});
      }
      return { conversation: conversationJSON(conversation, me) };
    },
  ],
  [
    'GET',
    '/conversations/:id/messages',
    ({ me, params, query }) => {
      const conversation = loadConversation(params.id, me);
      const { before, limit } = validate(messagesQuery, query);
      const rows = db.messages
        .filter((m) => sameId(m.conversation, conversation._id) && (!before || m._id < before.toLowerCase()))
        .sort((a, b) => (a._id < b._id ? 1 : -1))
        .slice(0, limit + 1);
      const hasMore = rows.length > limit;
      return {
        conversation: conversationJSON(conversation, me),
        messages: rows.slice(0, limit).reverse().map(messageJSON),
        hasMore,
      };
    },
  ],
  [
    'POST',
    '/conversations/:id/messages',
    ({ me, params, body }) => {
      const conversation = loadConversation(params.id, me);
      const { content } = validate(sendSchema, body);
      const other = byId('users', otherParticipantId(conversation, me._id));
      const allowed = other?.status === 'active' && (conversation.listing || areConnected(me._id, other._id));
      if (!allowed) throw forbidden('You can only message your connections');

      const payload = createMessage(conversation, me._id, content);
      scheduleReply(conversation._id, me._id);
      return respond(201, { message: payload });
    },
  ],
  [
    'POST',
    '/conversations/:id/read',
    ({ me, params }) => {
      const conversation = loadConversation(params.id, me);
      const readAt = nowISO();
      let modified = 0;
      for (const m of db.messages) {
        if (isUnreadFor(conversation._id, me._id)(m)) {
          m.readAt = readAt;
          modified += 1;
        }
      }
      if (modified > 0) {
        save();
        emitToUser(otherParticipantId(conversation, me._id), 'conversation:read', { conversationId: conversation._id, readAt });
        emitToUser(me._id, 'conversation:read', { conversationId: conversation._id, readAt, byMe: true });
      }
      return { read: modified };
    },
  ],
]);

/* ================================ Marketplace ================================ */

const LISTING_CATEGORIES = ['books', 'electronics', 'phones', 'fashion', 'hostel', 'stationery', 'services', 'other'];
const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair'];
const PUBLIC_LISTING = ['active', 'sold'];
const MAX_PHOTOS = 4;

const price = z.coerce.number({ message: 'Enter a price' }).int('Use whole dalasi').min(0).max(1_000_000);
const details = {
  title: z.string().trim().min(3, 'Give it a title of at least 3 characters').max(80),
  description: z.string().trim().max(1500).optional(),
  price,
  category: z.enum(LISTING_CATEGORIES, { message: 'Choose a category' }),
  condition: z.enum(LISTING_CONDITIONS).default('good'),
  location: z.string().trim().max(80).optional(),
};
const createSchema = z.object(details);
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.optional()])),
  status: z.enum(['active', 'sold']).optional(),
  keepPhotos: z
    .union([z.array(z.string()), z.string()])
    .transform((v, ctx) => {
      if (typeof v !== 'string') return v;
      try {
        const parsed = JSON.parse(v || '[]');
        if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) return parsed;
      } catch {
        // fall through
      }
      ctx.addIssue({ code: 'custom', message: 'Invalid photo list' });
      return z.NEVER;
    })
    .optional(),
});
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(LISTING_CATEGORIES).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  mine: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const isSeller = (listing, user) => sameId(listing.seller, user._id);

function serializeListing(listing, viewer) {
  const s = byId('users', listing.seller);
  const mine = isSeller(listing, viewer);
  return {
    id: listing._id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    location: listing.location,
    photos: listing.photos ?? [],
    status: listing.status,
    createdAt: listing.createdAt,
    soldAt: listing.soldAt,
    seller: s?.name
      ? { id: s._id, name: s.name, avatarUrl: s.avatarUrl, programme: s.programme, yearOfStudy: s.yearOfStudy, isVerified: Boolean(s.emailVerifiedAt) }
      : null,
    isMine: mine,
    canManage: mine || isAdmin(viewer),
  };
}

function loadListing(id, viewer) {
  const listing = byId('listings', id);
  if (!listing) throw notFound('Listing not found');
  const sellerActive = byId('users', listing.seller)?.status === 'active';
  if ((!PUBLIC_LISTING.includes(listing.status) || !sellerActive) && !isSeller(listing, viewer) && !isAdmin(viewer)) throw notFound('Listing not found');
  return listing;
}

/** Splits multipart form data into text fields (like multer's req.body) and the photo files. */
function readForm(formData, body) {
  if (!formData) return { fields: body ?? {}, files: [] };
  const fields = {};
  const files = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') fields[key] = value;
    else if (key === 'photos') files.push(value);
  }
  if (files.length > MAX_PHOTOS) throw badRequest(`Add at most ${MAX_PHOTOS} photos`);
  return { fields, files };
}

const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

register([
  [
    'GET',
    '/listings',
    ({ me, query }) => {
      const { q, category, minPrice, maxPrice, sort, mine, page, limit } = validate(listQuery, query);
      const pattern = q ? q.toLowerCase() : null;
      const rows = db.listings.filter((l) => {
        if (mine === 'true') {
          if (!sameId(l.seller, me._id) || !PUBLIC_LISTING.includes(l.status)) return false;
        } else if (l.status !== 'active' || byId('users', l.seller)?.status !== 'active') return false;
        if (category && l.category !== category) return false;
        if (pattern && !l.title.toLowerCase().includes(pattern) && !(l.description ?? '').toLowerCase().includes(pattern)) return false;
        if (minPrice !== undefined && l.price < minPrice) return false;
        if (maxPrice !== undefined && l.price > maxPrice) return false;
        return true;
      });
      const order = {
        newest: byNewest,
        price_asc: (a, b) => a.price - b.price || byNewest(a, b),
        price_desc: (a, b) => b.price - a.price || byNewest(a, b),
      }[sort];
      rows.sort(order);
      const total = rows.length;
      return {
        listings: rows.slice((page - 1) * limit, page * limit).map((l) => serializeListing(l, me)),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      };
    },
  ],
  [
    'POST',
    '/listings',
    async ({ me, formData, body }) => {
      const { fields, files } = readForm(formData, body);
      const data = validate(createSchema, fields);
      const photos = [];
      for (const file of files.slice(0, MAX_PHOTOS)) photos.push(await fileToDataUrl(file, 900));
      const listing = insert('listings', { ...data, seller: String(me._id), photos, status: 'active' });
      return respond(201, { listing: serializeListing(listing, me) });
    },
  ],
  [
    'GET',
    '/listings/:id',
    ({ me, params }) => {
      const listing = loadListing(params.id, me);
      const more = db.listings
        .filter((l) => sameId(l.seller, listing.seller) && l.status === 'active' && l._id !== listing._id)
        .sort(byNewest)
        .slice(0, 4);
      return { listing: serializeListing(listing, me), moreFromSeller: more.map((l) => serializeListing(l, me)) };
    },
  ],
  [
    'PATCH',
    '/listings/:id',
    async ({ me, params, formData, body }) => {
      const { fields, files } = readForm(formData, body);
      const data = validate(updateSchema, fields);
      const listing = loadListing(params.id, me);
      if (!isSeller(listing, me)) throw forbidden('Only the seller can edit this listing');
      if (!PUBLIC_LISTING.includes(listing.status)) throw badRequest('This listing can no longer be edited');

      const { keepPhotos, status, ...rest } = data;
      const changes = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const current = listing.photos ?? [];

      if (keepPhotos !== undefined || files.length) {
        const keep = (keepPhotos ?? current).filter((url) => current.includes(url));
        const added = [];
        for (const file of files) added.push(await fileToDataUrl(file, 900));
        const next = [...keep, ...added];
        if (next.length > MAX_PHOTOS) throw badRequest(`Add at most ${MAX_PHOTOS} photos`);
        changes.photos = next;
      }

      if (status && status !== listing.status) {
        changes.status = status;
        changes.soldAt = status === 'sold' ? nowISO() : undefined;
      }
      update(listing, changes);
      if (listing.soldAt === undefined) delete listing.soldAt;
      return { listing: serializeListing(listing, me) };
    },
  ],
  [
    'DELETE',
    '/listings/:id',
    ({ me, params }) => {
      const listing = loadListing(params.id, me);
      if (!isSeller(listing, me) && !isAdmin(me)) throw forbidden('Only the seller can delete this listing');
      update(listing, { status: 'removed', ...(!isSeller(listing, me) && { moderatedBy: String(me._id) }) });
      return respond(204);
    },
  ],
]);

/* ================================ Notifications ================================ */

const notificationsQuery = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
const readSchema = z.object({ ids: z.array(objectId).max(100).optional() });

register([
  [
    'GET',
    '/notifications',
    ({ me, query }) => {
      const { before, limit } = validate(notificationsQuery, query);
      const beforeMs = before ? new Date(before).getTime() : null;
      const items = db.notifications
        .filter((n) => sameId(n.recipient, me._id) && (beforeMs === null || new Date(n.updatedAt).getTime() < beforeMs))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limit + 1);
      const page = items.slice(0, limit);
      return {
        notifications: page.map(serializeNotification),
        unread: unreadCount(me._id),
        nextCursor: items.length > limit ? new Date(page.at(-1).updatedAt).toISOString() : null,
      };
    },
  ],
  ['GET', '/notifications/unread', ({ me }) => ({ unread: unreadCount(me._id) })],
  [
    'POST',
    '/notifications/read',
    ({ me, body }) => {
      const { ids } = validate(readSchema, body);
      const wanted = ids ? new Set(ids.map((id) => id.toLowerCase())) : null;
      const readAt = nowISO();
      for (const n of db.notifications) {
        if (sameId(n.recipient, me._id) && !n.readAt && (!wanted || wanted.has(n._id))) update(n, { readAt }, { touch: false });
      }
      return { unread: unreadCount(me._id) };
    },
  ],
]);

/* ================================ Reports ================================ */

const REPORT_TARGETS = ['post', 'comment', 'community', 'user', 'listing'];
const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'misinformation', 'impersonation', 'other'];
const TARGET_COLLECTIONS = { post: 'posts', comment: 'comments', community: 'communities', user: 'users', listing: 'listings' };

const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

register([
  [
    'POST',
    '/reports',
    ({ me, body }) => {
      const { targetType, targetId: rawId, reason, details: text } = validate(createReportSchema, body);
      const targetId = rawId.toLowerCase();
      const target = byId(TARGET_COLLECTIONS[targetType], targetId);
      const gone =
        !target ||
        (['post', 'comment'].includes(targetType) && target.status !== 'visible') ||
        (targetType === 'listing' && !PUBLIC_LISTING.includes(target.status));
      if (gone) throw notFound('That content no longer exists');
      if (targetType === 'user' && sameId(target._id, me._id)) throw badRequest('You cannot report yourself');
      if (targetType === 'listing' && sameId(target.seller, me._id)) throw badRequest('You cannot report your own listing');

      const existing = findOne(
        'reports',
        (r) => sameId(r.reporter, me._id) && r.targetType === targetType && sameId(r.targetId, targetId) && r.status === 'open',
      );
      if (existing) return { report: { id: existing._id, status: existing.status }, duplicate: true };

      const report = insert('reports', { reporter: String(me._id), targetType, targetId, reason, ...(text && { details: text }), status: 'open' });
      return respond(201, { report: { id: report._id, status: report.status } });
    },
  ],
]);
