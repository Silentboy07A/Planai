require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://localhost:11434/api/chat';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Plant Scope System Prompt
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

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
    const { message, mode } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    const systemPrompt = mode === 'expert' ? SYSTEM_PROMPT_EXPERT : SYSTEM_PROMPT_DEFAULT;

    // 1. Try Gemini first (if key exists)
    if (process.env.GEMINI_API_KEY) {
        try {
            console.log(`Sending request to Gemini (${mode} mode): ${message}`);

            const chat = model.startChat({
                history: [
                    {
                        role: "user",
                        parts: [{ text: systemPrompt }],
                    },
                    {
                        role: "model",
                        parts: [{ text: "Understood. I am ready to assist with plant care." }],
                    },
                ],
            });

            const result = await chat.sendMessage(message);
            const response = await result.response;
            const text = response.text();

            console.log("Received response from Gemini");
            return res.json({ reply: text });

        } catch (error) {
            console.error("Gemini Error (Falling back to Ollama):", error.message);
            // Fallthrough to Ollama
        }
    } else {
        console.log("No Gemini API Key found. Skipping to Ollama.");
    }

    // 2. Fallback to Ollama
    try {
        console.log(`Sending request to Ollama (${mode} mode): ${message}`);

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
        ];

        const response = await axios.post(OLLAMA_URL, {
            model: "llama3.1:8b", // Or any model the user has pulled
            messages: messages,
            stream: false
        });

        const botReply = response.data.message.content;
        console.log("Received response from Ollama");

        return res.json({
            reply: botReply
        });

    } catch (error) {
        console.error("Error communicating with Ollama:", error.message);

        let errorMsg = "AI Service Unavailable.";
        let suggestion = "";

        if (error.code === 'ECONNREFUSED') {
            errorMsg = "Could not connect to AI services.";
            suggestion = "Please ensure Ollama is running (port 11434) or add a valid GEMINI_API_KEY to .env.";
        }

        return res.status(503).json({
            error: errorMsg,
            suggestion: suggestion
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: "OK",
        gemini_enabled: !!process.env.GEMINI_API_KEY,
        ollama_url: OLLAMA_URL
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Gemini Enabled: ${!!process.env.GEMINI_API_KEY}`);
});
