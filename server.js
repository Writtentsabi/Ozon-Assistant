import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));

async function processAIRequest(req, res, modelName) {
    try {
        const { prompt, history, image, mimeType } = req.body;

        if (!prompt) return res.status(400).json({ error: "Missing prompt." });

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: "Your name is Zen, personal assistant for OxyZen Browser. Write thought process in <div class='thought'>...</div> and use HTML for response." 
        });

        let result;
        if (image && mimeType) {
            // MULTIMODAL (Εικόνα + Κείμενο)
            const imagePart = { inlineData: { data: image, mimeType: mimeType } };
            // Σημείωση: Για multimodal αποφεύγουμε το startChat αν υπάρχει εικόνα στο τρέχον request
            result = await model.generateContent([prompt, imagePart]);
        } else {
            // TEXT ONLY (Με Ιστορικό)
            const chat = model.startChat({ history: history || [] });
            result = await chat.sendMessage(prompt);
        }

        const response = await result.response;
        res.json({ text: response.text() });

    } catch (error) {
        console.error("AI Communication Error:", error);
        // Επιστρέφουμε το πραγματικό μήνυμα σφάλματος για να το δεις στο Android
        res.status(500).json({ error: error.message || "Unknown AI Error" });
    }
}

// ΠΡΟΣΟΧΗ: Αυτά είναι τα ΜΟΝΑ έγκυρα IDs για το SDK αυτή τη στιγμή
app.post('/api/chat', (req, res) => processAIRequest(req, res, "gemini-1.5-flash")); 
app.post('/api/multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-1.5-flash"));

app.post('/api/advanced-chat', (req, res) => processAIRequest(req, res, "gemini-2.0-flash")); 
app.post('/api/advanced-multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-2.0-flash"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
