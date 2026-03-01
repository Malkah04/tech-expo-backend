const mongoose = require('mongoose');
const crypto = require('crypto');

const SessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sessionToken: {
    type: String,
    required: true,
    unique: true,
  },
  csrfToken: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['valid', 'expired'],
    default: 'valid',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true, 
  }
});

SessionSchema.statics.generateToken = function () {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(32, (err, buffer) => {
            if (err) {
                return reject(err);
            }
            resolve(buffer.toString('hex'));
        });
    });
}
SessionSchema.statics.expireAllTokensForUser = function(userId) {
  return this.updateMany({ userId }, { $set: { status: 'expired' } });
};

module.exports = mongoose.model('Session', SessionSchema);