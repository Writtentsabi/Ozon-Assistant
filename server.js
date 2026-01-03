// server.js (Πλήρης διορθωμένη έκδοση για @google/genai)
import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';
import PaxSenixAI from '@paxsenix/ai';

const app = express();
const PORT = process.env.PORT || 3000;

// Χρήση σταθερών μοντέλων
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-exp";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.
CORE RULE: Every response MUST consist of:
1. INTERNAL MONOLOGUE in <div class="thought"> tags.
2. FINAL RESPONSE in HTML tags.`;

const IMAGE_SYSTEM_INSTRUCTION = `Translate visual description to English and generate image.`;

// --- Helper Logic Functions ---

async function getRouteIntent(prompt) {
    try {
        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash-exp",
            config: {
                systemInstruction: "Reply ONLY 'IMAGE' or 'TEXT' based on user intent."
            },
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        const responseText = result.text().trim().toUpperCase();
        return responseText.includes("IMAGE") ? "IMAGE" : "TEXT";
    } catch (error) {
        return "TEXT";
    }
}

async function chatWithLogic(prompt, history, images, mimeType) {
    const chat = genAI.chats.create({
        model: CHAT_MODEL,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            safetySettings: safetySettings,
            tools: [{ googleSearch: {} }] 
        },
        history: history || []
    });

    // ΔΙΟΡΘΩΣΗ: Το payload πρέπει να είναι ένα αντικείμενο Content (role + parts)
    let parts = [];
    
    if (images && images.length > 0) {
        images.forEach(data => {
            parts.push({ inlineData: { data: data, mimeType: mimeType || "image/jpeg" } });
        });
    }
    parts.push({ text: prompt });

    // Στέλνουμε το αντικείμενο στη μορφή που απαιτεί το ContentUnion
    const result = await chat.sendMessage({
        role: "user",
        parts: parts
    });
    
    return {
        text: result.text(),
        token: result.usageMetadata?.totalTokenCount || 0
    };
}

async function generateImageLogic(prompt, images, mimeType, aspectRatio = "1:1") {
    let parts = [];
    if (images && images.length > 0) {
        images.forEach(data => {
            parts.push({ inlineData: { data: data, mimeType: mimeType || "image/jpeg" } });
        });
    }
    parts.push({ text: prompt });

    const result = await genAI.models.generateContent({
        model: IMAGE_MODEL,
        config: {
            systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
            safetySettings: safetySettings,
            responseModalities: ["IMAGE"],
            generationConfig: {
                aspectRatio: aspectRatio,
                personGeneration: "ALLOW"
            }
        },
        contents: [{ role: "user", parts: parts }]
    });

    const candidate = result.candidates?.[0];
    const responseParts = candidate?.content?.parts;

    if (!responseParts) throw new Error("No image returned");

    const generatedImages = responseParts
        .filter(part => part.inlineData)
        .map(part => ({
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType
        }));

    return { success: true, images: generatedImages, token: result.usageMetadata?.totalTokenCount || 0 };
}

// --- Endpoints ---

app.post('/api/zen-assistant', async (req, res) => {
    const { prompt, history, images, mimeType, aspectRatio } = req.body;
    try {
        const intent = await getRouteIntent(prompt);
        if (intent === "IMAGE") {
            const result = await generateImageLogic(prompt, images, mimeType, aspectRatio);
            res.json(result);
        } else {
            const result = await chatWithLogic(prompt, history, images, mimeType);
            res.json(result);
        }
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/paxsenix-chat', async (req, res) => {
    const { prompt } = req.body;
    try {
        const response = await paxsenix.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, { role: 'user', content: prompt }]
        });
        res.json({ text: response.text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/wake', (req, res) => res.json({ status: "online" }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
