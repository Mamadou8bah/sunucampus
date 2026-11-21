import mongoose from 'mongoose';
import { cleanJSON } from './plugins.js';

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: [(v) => v.length === 2, 'A conversation has exactly two participants'],
      index: true,
    },
    pairKey: { type: String, required: true, unique: true },
    // Set when the chat started from a marketplace listing.
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    lastMessage: {
      content: String,
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: Date,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

conversationSchema.methods.hasParticipant = function hasParticipant(userId) {
  return this.participants.some((p) => (p._id ?? p).equals(userId));
};

conversationSchema.methods.otherParticipant = function otherParticipant(userId) {
  return this.participants.find((p) => !(p._id ?? p).equals(userId));
};


cleanJSON(conversationSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, sender: 1, readAt: 1 });
messageSchema.index({ createdAt: -1 });

cleanJSON(messageSchema);
export const Message = mongoose.model('Message', messageSchema);
