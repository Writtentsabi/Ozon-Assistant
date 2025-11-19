// server.js (ΠΡΩΗΝ google.js)

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση του κλειδιού από το Render Environment
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// 1. Ρύθμιση για Static Files (HTML, CSS, Client JS)
app.use(express.static('public')); 
app.use(express.json());          

// 2. Το API Endpoint (Το client.js θα καλεί αυτό το URL)
app.post('/api/chat', async (req, res) => {
    
    // Όλος ο κώδικας που ήταν μέσα στο event listener του 'ask'
    const prompt = req.body.prompt; // Παίρνουμε το prompt από το client.js

    // ... (Εδώ μπορείτε να χειριστείτε το historyArray στον server αν θέλετε)

    const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        history: req.body.history || [], // Πρέπει να στέλνει το history από τον client
        config: {
            systemInstruction: "Your name is Ozor, you are the personal assistant...",
        },
    });

    try {
        const response = await chat.sendMessage({
            message: prompt,
        });

        // Στέλνουμε πίσω την απάντηση
        res.json({ text: response.text }); 
        
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Server error during Gemini call." });
    }
});

// 3. Εκκίνηση Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

