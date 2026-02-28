const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/**
 * POST /api/auth/signup
 * Body: { username, email, password }
 */
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const user = await User.create({ username, email, password, authProvider: 'local' });
        const token = generateToken(user);

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: user.toJSON(),
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.authProvider === 'google') {
            return res.status(400).json({ error: 'This account uses Google Sign-In. Please use the Google button.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = generateToken(user);

        res.json({
            message: 'Login successful',
            token,
            user: user.toJSON(),
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

/**
 * POST /api/auth/google
 * Body: { credential } — Google ID token from Sign-In button
 */
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ error: 'Google credential is required' });
        }

        if (!googleClient) {
            return res.status(500).json({ error: 'Google OAuth not configured on server' });
        }

        // Verify Google ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        // Find or create user
        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
            // Update Google info if needed
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = 'google';
            }
            if (picture) user.avatar = picture;
            await user.save();
        } else {
            // Create new user
            user = await User.create({
                username: name || email.split('@')[0],
                email,
                googleId,
                avatar: picture,
                authProvider: 'google',
            });
        }

        const token = generateToken(user);

        res.json({
            message: 'Google sign-in successful',
            token,
            user: user.toJSON(),
        });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(401).json({ error: 'Google authentication failed' });
    }
});

/**
 * GET /api/auth/google-client-id
 * Returns the Google Client ID for frontend
 */
router.get('/google-client-id', (req, res) => {
    res.json({ clientId: GOOGLE_CLIENT_ID || null });
});

/**
 * GET /api/auth/me
 * Returns current user profile (requires auth middleware upstream)
 */
router.get('/me', async (req, res) => {
    res.json({ user: req.user.toJSON() });
});

module.exports = router;
