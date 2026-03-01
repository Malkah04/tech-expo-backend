const jwt = require('jsonwebtoken'); // This brings in the tool to make and check special login codes (tokens)

// This function makes a short-lived login code (access token)
exports.generateAccessToken = (user) => { // We give it a user
  return jwt.sign( // It makes a code
    { id: user._id, role: user.role }, // The code remembers who the user is and their role
    process.env.JWT_SECRET, // It uses a secret key to keep it safe
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } // The code only works for a short time (like 15 minutes)
  );
};

// This function makes a long-lived login code (refresh token)
exports.generateRefreshToken = (user) => { // We give it a user
  return jwt.sign( // It makes a code
    { id: user._id }, // The code remembers who the user is
    process.env.JWT_REFRESH_SECRET, // It uses a different secret key to keep it safe
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } // The code works for a long time (like 7 days)
  );
}; 