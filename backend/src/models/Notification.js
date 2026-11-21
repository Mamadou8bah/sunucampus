import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = Object.freeze([
  'like', // grouped per post: "Awa and 3 others liked your post"
  'comment',
  'connection_request',
  'connection_accepted',
  'community_approved',
  'community_rejected',
  'content_moderated', // an admin hid or removed something you posted
  'warning', // an admin warned you about your behaviour
]);

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // Who did it, most recent first. Likes collect several people in one notification.
    actors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    actorCount: { type: Number, default: 0 },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
    // Comment excerpt, moderation reason or the admin's warning.
    text: { type: String, trim: true, maxlength: 1000 },
    // What a moderation notice is about, e.g. 'post', 'comment', 'listing'.
    subject: { type: String, trim: true, maxlength: 40 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, updatedAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
