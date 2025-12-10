require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

// Redis client setup with graceful no-op fallback when Redis is unavailable
let redisClient;

function createNoopRedis() {
    return {
        isOpen: false,
        get: async () => null,
        setEx: async () => {},
        del: async () => {},
        quit: async () => {},
    };
}

const useRedis = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT);
if (useRedis) {
    try {
        const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
        redisClient = redis.createClient({
            url,
            legacyMode: true,
        });

        redisClient.on('error', (err) => {
            console.warn('[Redis] Connection error:', err && err.message ? err.message : String(err));
        });

        redisClient.on('connect', () => {
            console.log('[Redis] Connected to Redis server');
        });

        // Connect Redis (non-blocking). If it fails, swap in noop client.
        redisClient.connect().catch(err => {
            console.warn('[Redis] Could not connect, continuing without cache:', err && err.message ? err.message : String(err));
            redisClient = createNoopRedis();
        });
    } catch (e) {
        console.warn('[Redis] Init error, continuing without cache:', e && e.message ? e.message : String(e));
        redisClient = createNoopRedis();
    }
} else {
    // No Redis settings provided — use noop cache to avoid connection errors
    redisClient = createNoopRedis();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Redirect root to login page (must be before static middleware)
app.get('/', (req, res) => {
    return res.redirect('/login.html');
});
// Serve frontend static files from the sibling `frontend` directory
const staticDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(staticDir));

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled Rejection:', reason);
});

// Rate limiting middleware
const affirmationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many affirmation requests. Please try again in a minute.',
    standardHeaders: true,
    legacyHeaders: false,
});

const entriesLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many entry requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Generate affirmation endpoint with caching and rate limiting
app.post('/generate-affirmation', affirmationLimiter, async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "No text provided for affirmation generation." });
    }

    const cacheKey = `affirmation:${Buffer.from(text.substring(0, 200)).toString('base64')}`;

    try {
        const cachedAffirmation = await redisClient.get(cacheKey);
        if (cachedAffirmation) {
            console.log(`[Redis] Cache hit for affirmation`);
            return res.json({ affirmation: cachedAffirmation, cached: true });
        }
    } catch (err) {
        console.warn('[Redis] Cache lookup error:', err.message);
    }``

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    let affirmation = null;
    let provider = null;
    let lastError = null;

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'OpenRouter API key not configured.' });
    }

    // OpenRouter (only provider)
    if (!affirmation) {
        try {
            console.log('[OpenRouter] Generating affirmation...');
            const prompt = `Generate a concise, positive affirmation (one or two sentences) based on this journal entry. Keep it under 150 characters and make it deeply personal and meaningful. Journal entry: "${text.substring(0, 300)}"`;

            const orResponse = await fetch(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a compassionate mental wellness advisor. Generate personalized affirmations for journal entries that are meaningful, uplifting, and directly related to the user\'s reflections.'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.8,
                        max_tokens: 120
                    })
                }
            );

            console.log(`[OpenRouter] Response status: ${orResponse.status}`);

            if (orResponse.ok) {
                const orData = await orResponse.json();
                if (orData.choices && orData.choices.length > 0) {
                    const message = orData.choices[0].message;
                    if (message && message.content) {
                        affirmation = message.content.trim();
                        provider = 'openrouter';
                        console.log('[OpenRouter] Successfully generated affirmation');
                    }
                }
            } else {
                const errorData = await orResponse.json().catch(() => ({}));
                lastError = `OpenRouter ${orResponse.status}: ${errorData.error || errorData.message || 'Unknown error'}`;
                console.log('[OpenRouter] API error:', lastError);
            }
        } catch (error) {
            lastError = `OpenRouter fetch error: ${error.message}`;
            console.log('[OpenRouter] Fetch error:', error.message);
        }
    }

    if (!affirmation) {
        console.log('[Affirmation] Failed to generate affirmation. Last error:', lastError);
        return res.status(502).json({ error: 'Unable to generate affirmation. Check OpenRouter billing/quota.', provider, lastError });
    }

    try {
        await redisClient.setEx(cacheKey, 24 * 60 * 60, affirmation);
        console.log(`[Redis] Cached affirmation`);
    } catch (err) {
        console.warn('[Redis] Cache write error:', err.message);
    }

    res.json({ affirmation: affirmation, cached: false });
});

// Health endpoint
app.get('/health', (req, res) => {
    const state = mongoose.connection.readyState;
    const redisConnected = redisClient.isOpen;
    res.json({ status: 'ok', dbState: state, connected: state === 1, redisConnected });
});

// --- Social OAuth scaffolding (redirects) ---
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Google: redirect to Google OAuth consent page if client id configured
app.get('/auth/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${BASE_URL}/auth/google/callback`;
    if (!clientId) return res.status(501).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    const scope = encodeURIComponent('openid email profile');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    return res.redirect(url);
});

app.get('/auth/google/callback', (req, res) => {
    // Placeholder callback - exchange `code` server-side with Google's token endpoint
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code.');
    res.send('Google callback received. Implement server-side code exchange using GOOGLE_CLIENT_SECRET.');
});

// Facebook: redirect to Facebook OAuth if configured
app.get('/auth/facebook', (req, res) => {
    const clientId = process.env.FACEBOOK_APP_ID;
    const redirectUri = `${BASE_URL}/auth/facebook/callback`;
    if (!clientId) return res.status(501).json({ error: 'Facebook OAuth not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env' });
    const scope = encodeURIComponent('email,public_profile');
    const url = `https://www.facebook.com/v13.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=state&response_type=code&scope=${scope}`;
    return res.redirect(url);
});

app.get('/auth/facebook/callback', (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code.');
    res.send('Facebook callback received. Implement server-side code exchange using FACEBOOK_APP_SECRET.');
});

// X (Twitter) - placeholder
app.get('/auth/x', (req, res) => {
    // Twitter/X OAuth2 requires PKCE and app configuration. Provide guidance if not configured.
    return res.status(501).json({ error: 'X/Twitter OAuth not configured on server. See README to configure OAuth 2.0 with PKCE.' });
});

// Entry routes with caching and rate limiting
app.post('/entries', entriesLimiter, async (req, res) => {
    try {
        console.log(`[entries] Received save request at ${new Date().toISOString()}`);
        console.log('[entries] Payload keys:', Object.keys(req.body));

        const newEntry = new Entry(req.body);
        const saved = await newEntry.save();
        console.log(`[entries] Saved entry id=${saved._id}`);

        try {
            // Clear both all entries cache and user-specific cache
            await redisClient.del('entries:all');
            if (req.body.userId) {
                await redisClient.del(`entries:user:${req.body.userId}`);
            }
            console.log('[Redis] Cleared entries cache');
        } catch (err) {
            console.warn('[Redis] Cache invalidation error:', err.message);
        }

        res.status(201).json(saved);
    } catch (error) {
        console.error('Error saving entry:', error && error.stack ? error.stack : error);
        const status = (error && error.name === 'ValidationError') ? 400 : 500;
        res.status(status).json({ message: error.message || 'Internal server error' });
    }
});

app.get('/entries', entriesLimiter, async (req, res) => {
    const { userId, isAdmin } = req.query;
    
    // Admin users can see all entries, regular users only see their own
    const query = (isAdmin === 'true') ? {} : { userId };
    const cacheKey = (isAdmin === 'true') ? 'entries:all' : `entries:user:${userId}`;
    
    try {
        const cachedEntries = await redisClient.get(cacheKey);
        if (cachedEntries) {
            console.log(`[Redis] Cache hit for ${cacheKey}`);
            return res.json(JSON.parse(cachedEntries));
        }
    } catch (err) {
        console.warn('[Redis] Cache lookup error:', err.message);
    }

    try {
        const entries = await Entry.find(query).sort({ createdAt: -1 });
        
        try {
            await redisClient.setEx(cacheKey, 5 * 60, JSON.stringify(entries));
            console.log(`[Redis] Cached entries for ${cacheKey}`);
        } catch (err) {
            console.warn('[Redis] Cache write error:', err.message);
        }

        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/entries/:id', entriesLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        const deletedEntry = await Entry.findByIdAndDelete(id);
        if (!deletedEntry) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        try {
            // Clear both all entries cache and user-specific cache
            await redisClient.del('entries:all');
            if (userId) {
                await redisClient.del(`entries:user:${userId}`);
            }
            console.log('[Redis] Cleared entries cache after deletion');
        } catch (err) {
            console.warn('[Redis] Cache invalidation error:', err.message);
        }

        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin endpoint to fetch all entries
app.get('/api/admin/entries', async (req, res) => {
    try {
        const entries = await Entry.find().sort({ createdAt: -1 });
        res.json({ entries });
    } catch (error) {
        console.error('Error fetching admin entries:', error);
        res.status(500).json({ message: error.message });
    }
});

// Admin endpoint to fetch all users
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        console.log('[Admin] Fetched users count:', users.length);
        res.json({ users });
    } catch (error) {
        console.error('Error fetching admin users:', error);
        res.status(500).json({ message: error.message });
    }
});

// Debug endpoint to check database directly
app.get('/api/debug/db', async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const entryCount = await Entry.countDocuments();
        const users = await User.find().limit(5);
        const entries = await Entry.find().limit(5);
        
        res.json({
            database: {
                connected: mongoose.connection.readyState === 1,
                name: mongoose.connection.name
            },
            counts: {
                users: userCount,
                entries: entryCount
            },
            sampleUsers: users,
            sampleEntries: entries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Auth sync endpoint
app.post('/api/auth/sync-user', async (req, res) => {
    try {
        console.log('[Sync User] Request received:', req.body);
        
        if (!req.body?.profile) {
            console.log('[Sync User] Missing profile payload');
            return res.status(400).json({ message: 'Missing profile payload.' });
        }

        const { profile } = req.body;

        const update = {
            clerkId: profile.userId,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            imageUrl: profile.imageUrl,
        };

        console.log('[Sync User] Updating user:', update);

        const user = await User.findOneAndUpdate(
            { clerkId: profile.userId },
            update,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        console.log('[Sync User] User synced:', user);
        res.json({ user });
    } catch (error) {
        console.error('[Sync User] Error:', error);
        res.status(500).json({ message: error.message });
    }
});

// MongoDB schemas
const entrySchema = new mongoose.Schema({
    userId: { type: String, required: false }, // Clerk user ID
    userEmail: { type: String, required: false }, // User email for display
    date: { type: String, required: true },
    moodValue: { type: Number, required: true },
    moodLabel: { type: String, required: true },
    text: { type: String, required: true },
    affirmation: { type: String, required: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

const Entry = mongoose.model('Entry', entrySchema);

const userSchema = new mongoose.Schema({
    clerkId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    imageUrl: { type: String },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// MongoDB connection with retry logic
const connectDB = () => {
    mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 5000,
    })
    .then(() => {
        console.log('MongoDB connected...');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
        console.log('Retrying in 5 seconds...');
        setTimeout(connectDB, 5000);
    });
};

connectDB();

// Start server with SO_REUSEADDR
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        redisClient.quit();
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        redisClient.quit();
        process.exit(0);
    });
});
