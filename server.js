import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Αρχικοποίηση - Χρήση 'new' γιατί είναι Class
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));

async function processAIRequest(req, res, modelId) {
    try {
        const { prompt, history, image, mimeType } = req.body;

        if (!prompt) return res.status(400).json({ error: "Missing prompt." });

        const systemInstruction = "Your name is Zen, personal assistant for OxyZen Browser. Write thought process in <div class='thought'>...</div> and use HTML for response.";

        let result;
        if (image && mimeType) {
            // MULTIMODAL: Στο νέο SDK καλούμε το ai.generateContent
            result = await ai.generateContent({
                model: modelId,
                contents: [{ role: "user", parts: [{ inlineData: { data: image, mimeType: mimeType } }, { text: prompt }] }],
                systemInstruction: systemInstruction
            });
        } else {
            // TEXT ONLY: Με ιστορικό
            result = await ai.generateContent({
                model: modelId,
                contents: [...(history || []), { role: "user", parts: [{ text: prompt }] }],
                systemInstruction: systemInstruction
            });
        }

        const response = await result.response;
        res.json({ text: response.text() });

    } catch (error) {
        console.error("AI SDK Error:", error);
        res.status(500).json({ error: error.message });
    }
}

// Endpoints με τα σωστά IDs
app.post('/api/chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));
app.post('/api/multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));

app.post('/api/advanced-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));
app.post('/api/advanced-multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
