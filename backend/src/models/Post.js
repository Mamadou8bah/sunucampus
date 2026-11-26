import mongoose from 'mongoose';
import { cleanJSON } from './plugins.js';

export const CONTENT_STATUS = Object.freeze({
  VISIBLE: 'visible',
  HIDDEN: 'hidden', // hidden by a moderator, can be restored
  REMOVED: 'removed', // deleted by its author or a moderator
});

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', index: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likeTimes: { type: Map, of: Date, select: false },
    lastLikedAt: { type: Date, select: false },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(CONTENT_STATUS), default: CONTENT_STATUS.VISIBLE, index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ status: 1, author: 1, createdAt: -1, _id: -1 });
postSchema.index({ status: 1, lastLikedAt: -1, _id: -1 });
postSchema.index({ community: 1, status: 1, pinned: -1, createdAt: -1 });

cleanJSON(postSchema);
export const Post = mongoose.model('Post', postSchema);

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: Object.values(CONTENT_STATUS), default: CONTENT_STATUS.VISIBLE },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

commentSchema.index({ post: 1, status: 1, createdAt: 1 });
commentSchema.index({ status: 1, createdAt: -1 });

cleanJSON(commentSchema);
export const Comment = mongoose.model('Comment', commentSchema);
