const Session = require('../models/session.model.js');

const initializeSession = async (userId, rememberMe) => {
    try {
        const sessionToken = await Session.generateToken();
        const csrfToken = await Session.generateToken();
        
        const durationMs = rememberMe 
            ? 7 * 24 * 60 * 60 * 1000  
            : 24 * 60 * 60 * 1000;    

            console.log("Session duration (ms):", durationMs);

        const expiresAt = new Date(Date.now() + durationMs);

        const session = new Session({
            userId,
            sessionToken,
            csrfToken,
            expiresAt,
            status: 'valid', 
        });

        await session.save();
        return session;
    } catch (error) {
        console.error('Error initializing session:', error);
        throw error;
    }
};

module.exports = { initializeSession };
