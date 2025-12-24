// server.js
import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Προετοιμασία του Google Generative AI με το API Key σας
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// 1. Ρυθμίσεις Middleware
app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' })); // Για υποστήριξη μεγάλων αρχείων εικόνας

// Κοινή οδηγία συστήματος (System Instruction) για την προσωπικότητα του Zen
const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

// 2. Endpoint: Απλή Συνομιλία (Text-Only)
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(prompt);
        const responseText = result.response.text();

        res.json({ text: responseText });
    } catch (error) {
        console.error("Zen Chat Error:", error);
        res.status(500).json({ error: "Server error during Zen chat call.", details: error.message });
    }
});

// 3. Endpoint: Προχωρημένη Συνομιλία (Advanced Chat - Gemini Pro)
app.post('/api/advanced-chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(prompt);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Advanced Error:", error);
        res.status(500).json({ error: "Server error during advanced chat call.", details: error.message });
    }
});

// 4. Endpoint: Συνομιλία με Εικόνα (Multimodal)
app.post('/api/multimodal-chat', async (req, res) => {
    try {
        const { prompt, image, mimeType, history } = req.body;

        if (!image || !prompt) {
            return res.status(400).json({ error: "Missing image data or prompt." });
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const imagePart = {
            inlineData: {
                data: image,
                mimeType: mimeType
            }
        };

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage([prompt, imagePart]);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Multimodal Error:", error);
        res.status(500).json({ error: "Server error during multimodal chat call.", details: error.message });
    }
});

// 5. Endpoint: Προχωρημένη Συνομιλία με Εικόνα (Advanced Multimodal)
app.post('/api/advanced-multimodal-chat', async (req, res) => {
    try {
        const { prompt, image, mimeType, history } = req.body;

        if (!image || !prompt) {
            return res.status(400).json({ error: "Missing image data or prompt." });
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const imagePart = {
            inlineData: {
                data: image,
                mimeType: mimeType
            }
        };

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage([prompt, imagePart]);
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Zen Advanced Multimodal Error:", error);
        res.status(500).json({ error: "Server error during advanced multimodal call.", details: error.message });
    }
});

// Εκκίνηση του διακομιστή (Μία μόνο φορά)
app.listen(PORT, () => {
    console.log(`Zen Server is running on port ${PORT}`);
});
