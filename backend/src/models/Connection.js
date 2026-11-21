import mongoose from 'mongoose';
import { cleanJSON } from './plugins.js';

export const CONNECTION_STATUS = Object.freeze({ PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' });
export const CONNECTION_SOURCES = Object.freeze(['match', 'discover', 'profile']);

/** Sorted pair of ids, so A→B and B→A map to the same record. */
export const pairKeyOf = (a, b) => [a.toString(), b.toString()].sort().join(':');

const connectionSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: Object.values(CONNECTION_STATUS), default: CONNECTION_STATUS.PENDING, index: true },
    // How the requester found the other student; used by the reporting module.
    source: { type: String, enum: CONNECTION_SOURCES, default: 'profile' },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

connectionSchema.index({ recipient: 1, status: 1 });
connectionSchema.index({ requester: 1, status: 1 });

connectionSchema.methods.otherUser = function otherUser(userId) {
  return this.requester.toString() === userId.toString() ? this.recipient : this.requester;
};

cleanJSON(connectionSchema);

export const Connection = mongoose.model('Connection', connectionSchema);
