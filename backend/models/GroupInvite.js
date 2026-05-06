const mongoose = require('mongoose');
const crypto = require('crypto');

// Requirement: invite links expire in 24 hours
const INVITE_EXPIRY_HOURS = 24;
const STATUS = ['pending', 'accepted', 'expired', 'cancelled'];

const groupInviteSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true,
  },
  inviter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  message: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: STATUS,
    default: 'pending',
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  acceptedAt: { type: Date },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

groupInviteSchema.index({ group: 1, email: 1 });
groupInviteSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Generate secure token and store its hash
groupInviteSchema.statics.createToken = function () {
  return crypto.randomBytes(32).toString('hex');
};

groupInviteSchema.statics.hashToken = function (token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

groupInviteSchema.statics.getExpiryDate = function (hours = INVITE_EXPIRY_HOURS) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
};

module.exports = mongoose.model('GroupInvite', groupInviteSchema);
module.exports.INVITE_EXPIRY_HOURS = INVITE_EXPIRY_HOURS;
module.exports.STATUS = STATUS;
