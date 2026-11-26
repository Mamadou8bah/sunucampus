import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
});

schema.index({ viewer: 1, post: 1 }, { unique: true });
export const FeedDismissal = mongoose.model('FeedDismissal', schema);
