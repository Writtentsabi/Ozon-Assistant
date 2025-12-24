import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai"; // Νέος τρόπος εισαγωγής

const app = express();
const PORT = process.env.PORT || 3000;

// Αρχικοποίηση με το νέο SDK
const ai = GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));

async function processAIRequest(req, res, modelId) {
    try {
        const { prompt, history, image, mimeType } = req.body;

        if (!prompt) return res.status(400).json({ error: "Missing prompt." });

        // Στο νέο SDK χρησιμοποιούμε το ai.models.get
        const model = ai.models.get(modelId);

        const systemInstruction = "Your name is Zen, personal assistant for OxyZen Browser. Write thought process in <div class='thought'>...</div> and use HTML for response.";

        let result;
        if (image && mimeType) {
            // Multimodal κλήση
            const imagePart = { inlineData: { data: image, mimeType: mimeType } };
            result = await model.generateContent({
                contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
                systemInstruction: systemInstruction
            });
        } else {
            // Text-only κλήση με ιστορικό
            result = await model.generateContent({
                contents: [...(history || []), { role: "user", parts: [{ text: prompt }] }],
                systemInstruction: systemInstruction
            });
        }

        const response = await result.response;
        res.json({ text: response.text() });

    } catch (error) {
        console.error("SDK Error:", error);
        res.status(500).json({ error: error.message });
    }
}

// ΤΑ ΣΩΣΤΑ ENDPOINTS ΜΕ ΤΑ ΕΠΙΣΗΜΑ IDs
// 2.5 Flash 
app.post('/api/chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));
app.post('/api/multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-2.5-flash"));

// 3.0 Flash
app.post('/api/advanced-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));
app.post('/api/advanced-multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-3-flash-preview"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
