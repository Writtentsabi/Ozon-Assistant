// server.js
import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση του κλειδιού από το περιβάλλον
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(express.static('public')); 
app.use(express.json({ limit: '50mb' }));          

// Κοινή οδηγία συστήματος για όλα τα endpoints
const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

// 1. API για απλό Chat
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", // Προτείνεται το 1.5 για σταθερότητα
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage(prompt);
        res.json({ text: result.response.text() }); 
        
    } catch (error) {
        console.error("Zen Error:", error);
        res.status(500).json({ error: "Server error during Zen chat call." });
    }
});

// 2. API για Multimodal Chat (Εικόνα + Κείμενο)
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
            inlineData: { data: image, mimeType }
        };

        // Σημείωση: Στο SDK, αν στέλνετε εικόνα σε chat, 
        // το ιστορικό πρέπει να είναι συμβατό.
        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage([prompt, imagePart]);

        res.json({ text: result.response.text() }); 

    } catch (error) {
        console.error("Zen Vision Error:", error);
        res.status(500).json({ error: "Server error during multimodal call." });
    }
});

// 3. API για Advanced Chat (Χρήση ισχυρότερου μοντέλου)
app.post('/api/advanced-chat', async (req, res) => {
    try {
        const { prompt, history } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", // Το Pro είναι το "Advanced" μοντέλο
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage(prompt);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("Zen Advanced Error:", error);
        res.status(500).json({ error: "Server error during advanced chat." });
    }
});

// ΜΙΑ ΜΟΝΟ φορά το listen στο τέλος
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
