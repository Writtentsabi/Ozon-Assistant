import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai"; // Εισαγωγή της κλάσης

const app = express();
const PORT = process.env.PORT || 3000;

// ΔΙΟΡΘΩΣΗ: Προσθήκη της λέξης 'new' πριν από το GoogleGenAI
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));

async function processAIRequest(req, res, modelId) {
    try {
        const { prompt, history, image, mimeType } = req.body;

        if (!prompt) return res.status(400).json({ error: "Missing prompt." });

        // Στο @google/genai δημιουργούμε το chat/session από το ai.models
        const model = ai.models.get(modelId);

        const systemInstruction = "Your name is Zen, personal assistant for OxyZen Browser. Write thought process in <div class='thought'>...</div> and use HTML for response.";

        let result;
        if (image && mimeType) {
            // Multimodal Logic
            const imagePart = { inlineData: { data: image, mimeType: mimeType } };
            result = await model.generateContent({
                contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
                systemInstruction: systemInstruction
            });
        } else {
            // Text-only Logic με ιστορικό
            result = await model.generateContent({
                contents: [...(history || []), { role: "user", parts: [{ text: prompt }] }],
                systemInstruction: systemInstruction
            });
        }

        const response = await result.response;
        res.json({ text: response.text() });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: error.message });
    }
}

// Endpoints
app.post('/api/chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));
app.post('/api/multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));

app.post('/api/advanced-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));
app.post('/api/advanced-multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
