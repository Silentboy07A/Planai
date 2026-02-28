require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { authMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const streakRoutes = require('./routes/streaks');
const predictionRoutes = require('./routes/predictions');
const Prediction = require('./models/Prediction');

const app = express();
const PORT = process.env.PORT || 3000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plantscope';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static files
app.use('/Main Pages', express.static(path.join(__dirname, '..', 'Main Pages')));
app.use('/Novice', express.static(path.join(__dirname, '..', 'Novice')));
app.use('/Intermediate', express.static(path.join(__dirname, '..', 'Intermediate')));
app.use('/Expert', express.static(path.join(__dirname, '..', 'Expert')));
app.use('/', express.static(path.join(__dirname, '..', 'Main Pages'))); // Root serves dashboard

// ---------------------------------------------------------------------------
// MongoDB Connection
// ---------------------------------------------------------------------------
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ---------------------------------------------------------------------------
// Initialize Gemini
// ---------------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
console.log(`🤖 Gemini API Key loaded: ${process.env.GEMINI_API_KEY ? 'YES (' + process.env.GEMINI_API_KEY.substring(0, 10) + '...)' : 'NO'}`);

// Plant Scope System Prompts
const SYSTEM_PROMPT_DEFAULT = `
You are a calm, knowledgeable, and friendly Plant Care Assistant for "Plant Scope AI".
Your goal is to help users identify plant diseases, suggest care tips, and guide them in growing healthy plants.
Keep your answers concise, practical, and encouraging.
If you don't know an answer, admit it and suggest they consult a local nursery.
Do not answer questions unrelated to plants, gardening, or botany.
`;

const SYSTEM_PROMPT_EXPERT = `
You are an expert botanist and horticulturist for "Plant Scope AI".
Provide detailed, scientific, and in-depth explanations about plant physiology, pathology, and advanced care techniques.
Use technical terminology where appropriate but explain it clearly.
Focus on precise diagnosis and advanced treatment capabilities.
`;

// ---------------------------------------------------------------------------
// Public Routes (no auth required)
// ---------------------------------------------------------------------------

// Auth routes (signup, login)
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: "OK",
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        gemini_enabled: !!process.env.GEMINI_API_KEY,
        ml_service_url: ML_SERVICE_URL,
    });
});

// Auth check for /api/auth/me requires auth middleware
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ user: req.user.toJSON() });
});

// ---------------------------------------------------------------------------
// Protected Routes (auth required)
// ---------------------------------------------------------------------------

// Streaks
app.use('/api/streaks', authMiddleware, streakRoutes);

// Predictions
app.use('/api/predictions', authMiddleware, predictionRoutes);

// ---------------------------------------------------------------------------
// Chat Endpoint (Gemini + Ollama fallback)
// ---------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
    const { message, mode } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    const systemPrompt = mode === 'expert' ? SYSTEM_PROMPT_EXPERT : SYSTEM_PROMPT_DEFAULT;

    // Try Gemini (with one retry on rate limit)
    const tryGemini = async () => {
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "model", parts: [{ text: "Understood. I am ready to assist with plant care." }] },
            ],
        });
        const result = await chat.sendMessage(message);
        return result.response.text();
    };

    try {
        console.log(`[Chat] Gemini (${mode} mode): ${message.substring(0, 50)}...`);
        const text = await tryGemini();
        return res.json({ reply: text });
    } catch (error) {
        console.error("Gemini error:", error.message);

        // Rate limited — retry once after 3s
        if (error.message?.includes('429') || error.message?.includes('Resource has been exhausted')) {
            try {
                console.log("[Chat] Rate limited, retrying in 3s...");
                await new Promise(r => setTimeout(r, 3000));
                const text = await tryGemini();
                return res.json({ reply: text });
            } catch (e) {
                return res.status(429).json({ error: "AI is busy. Please wait a moment and try again." });
            }
        }

        return res.status(503).json({ error: "AI error: " + error.message });
    }
});

// ---------------------------------------------------------------------------
// ML Service Proxy — /api/predict & /api/analyze
// ---------------------------------------------------------------------------
app.post('/api/predict', async (req, res) => {
    try {
        const { imageData } = req.body; // base64 image

        if (!imageData) {
            return res.status(400).json({ error: 'imageData is required' });
        }

        // Convert base64 to buffer and send as multipart
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('image', buffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });

        const response = await axios.post(`${ML_SERVICE_URL}/predict`, formData, {
            headers: formData.getHeaders(),
            timeout: 30000,
        });

        res.json(response.data);
    } catch (error) {
        console.error('ML predict error:', error.message);
        res.status(503).json({
            error: 'ML service unavailable',
            suggestion: 'Ensure the ML service is running on ' + ML_SERVICE_URL,
        });
    }
});

app.post('/api/analyze', authMiddleware, async (req, res) => {
    try {
        const { imageData } = req.body; // base64 image

        if (!imageData) {
            return res.status(400).json({ error: 'imageData is required' });
        }

        // Convert base64 to buffer and send as multipart
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('image', buffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });

        const response = await axios.post(`${ML_SERVICE_URL}/analyze`, formData, {
            headers: formData.getHeaders(),
            timeout: 60000,
        });

        const result = response.data;

        // Save prediction to MongoDB
        try {
            await Prediction.create({
                userId: req.user._id,
                imageData: imageData.substring(0, 200) + '...', // Store thumbnail ref, not full base64
                disease: result.disease,
                confidence: result.confidence,
                treatment: result.treatment || '',
            });
        } catch (saveErr) {
            console.error('Failed to save prediction:', saveErr.message);
            // Don't fail the request if save fails
        }

        res.json(result);
    } catch (error) {
        console.error('ML analyze error:', error.message);
        res.status(503).json({
            error: 'ML service unavailable',
            suggestion: 'Ensure the ML service is running on ' + ML_SERVICE_URL,
        });
    }
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🌱 Plant Scope AI server running on http://localhost:${PORT}`);
    console.log(`   Gemini Enabled: ${!!process.env.GEMINI_API_KEY}`);
    console.log(`   ML Service: ${ML_SERVICE_URL}`);
    console.log(`   MongoDB: ${MONGODB_URI}`);
});
