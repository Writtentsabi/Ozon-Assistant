// server.js - Πλήρης Διορθωμένος Κώδικας
import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Αρχικοποίηση Google AI με το κλειδί σας από το περιβάλλον (Render/Heroku)
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(express.static('public')); 

// Αύξηση ορίου JSON για την αποστολή Base64 εικόνων
app.use(express.json({ limit: '50mb' }));

/**
 * Κοινή συνάρτηση για τη διαχείριση όλων των αιτημάτων AI.
 * Υποστηρίζει Text-only και Multimodal (εικόνα + κείμενο).
 */
async function processAIRequest(req, res, modelName) {
    try {
        const { prompt, history, image, mimeType } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Missing prompt." });
        }

        // Ορισμός του μοντέλου και των οδηγιών συστήματος
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: "Your name is Zen, you are the personal assistant for the OxyZen Browser. You MUST write your thought process first inside a <div class='thought'>...</div>. The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>)." 
        });

        let result;

        if (image && mimeType) {
            // MULTIMODAL LOGIC (Εικόνα + Κείμενο)
            const imagePart = {
                inlineData: {
                    data: image,
                    mimeType: mimeType 
                }
            };
            // Σημείωση: Στα multimodal αιτήματα, το ιστορικό συνήθως προστίθεται στο prompt 
            // ή χρησιμοποιείται διαφορετική μέθοδος ανάλογα με το SDK. 
            // Εδώ στέλνουμε εικόνα και prompt ως μέρη.
            result = await model.generateContent([prompt, imagePart]);
        } else {
            // SIMPLE CHAT LOGIC (Μόνο Κείμενο)
            const chat = model.startChat({
                history: history || [],
            });
            result = await chat.sendMessage(prompt);
        }

        const response = await result.response;
        const text = response.text();
        
        // Επιστροφή JSON αντικειμένου στην εφαρμογή
        res.json({ text: text });

    } catch (error) {
        console.error(`Zen Error (${modelName}):`, error);
        // Εξασφαλίζουμε ότι επιστρέφουμε πάντα JSON ακόμα και σε σφάλμα
        res.status(500).json({ error: "Server error during AI communication." });
    }
}

// --- ENDPOINTS ΓΙΑ GEMINI 2.5 FLASH ---
app.post('/api/chat', (req, res) => processAIRequest(req, res, "gemini-1.5-flash")); // Σημείωση: Το 2.5 flash αντιστοιχεί συνήθως σε 1.5 flash στο SDK
app.post('/api/multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-1.5-flash"));

// --- ENDPOINTS ΓΙΑ GEMINI 3.0 FLASH (Advanced) ---
app.post('/api/advanced-chat', (req, res) => processAIRequest(req, res, "gemini-2.0-flash")); // Χρησιμοποιήστε το όνομα μοντέλου που παρέχει η Google για το 3.0/2.0
app.post('/api/advanced-multimodal-chat', (req, res) => processAIRequest(req, res, "gemini-2.0-flash"));

// ΜΟΝΟ ΕΝΑ app.listen στο τέλος του αρχείου για να αποφύγουμε το κρασάρισμα
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
