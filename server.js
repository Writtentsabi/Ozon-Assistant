// server.js
import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΔΙΟΡΘΩΣΗ: Το API Key περνιέται ως string, όχι ως αντικείμενο {apiKey: ...}
// Αυτό λύνει το σφάλμα "getGenerativeModel is not a function"
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

// 1. API: Απλή Συνομιλία (Gemini 1.5 Flash)
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage(prompt);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Chat Error:", error);
        res.status(500).json({ error: "Server error during Zen chat call.", details: error.message });
    }
});

// 2. API: Advanced Chat (Gemini 2.0 Flash)
app.post('/api/advanced-chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage(prompt);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Advanced Error:", error);
        res.status(500).json({ error: "Server error during advanced chat.", details: error.message });
    }
});

// 3. API: Multimodal Chat (Εικόνα + Κείμενο)
app.post('/api/multimodal-chat', async (req, res) => {
    try {
        const { prompt, image, mimeType, history } = req.body;
        if (!image || !prompt) return res.status(400).json({ error: "Missing image/prompt." });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const imagePart = { inlineData: { data: image, mimeType } };
        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage([prompt, imagePart]);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Multimodal Error:", error);
        res.status(500).json({ error: "Server error during vision call.", details: error.message });
    }
});

// 4. API: Advanced Multimodal (Gemini 2.0 Flash)
app.post('/api/advanced-multimodal-chat', async (req, res) => {
    try {
        const { prompt, image, mimeType, history } = req.body;
        if (!image || !prompt) return res.status(400).json({ error: "Missing image/prompt." });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const imagePart = { inlineData: { data: image, mimeType } };
        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage([prompt, imagePart]);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Advanced Multimodal Error:", error);
        res.status(500).json({ error: "Server error during advanced vision call.", details: error.message });
    }
});

// Μόνο μία φορά η εκκίνηση του server
app.listen(PORT, () => {
    console.log(`Zen Server is active on port ${PORT}`);
});
