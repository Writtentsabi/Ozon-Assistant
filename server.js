// server.js

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

// 2. Το API Endpoint για Συνομιλία (Chat)
app.post('/api/chat', async (req, res) => {
    
    const prompt = req.body.prompt; 

    const chat = ai.chats.create({
        model: "gemini-2.5-flash", // Χρησιμοποιούμε το μοντέλο κειμένου
        history: req.body.history || [], 
        config: {
            systemInstruction: "Your name is Ozor, you are the personal assistant for the Ozon Browser. An app uploaded also on Play Store. You are interacting through an html website, so you should write your answers as an innerHTML",
        },
    });

    try {
        const response = await chat.sendMessage({
            message: prompt,
        });

        res.json({ text: response.text }); 
        
    } catch (error) {
        console.error("Gemini Chat Error:", error);
        res.status(500).json({ error: "Server error during Gemini chat call." });
    }
});

// 3. Το API Endpoint για Δημιουργία Εικόνων (ΝΕΟ)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt for image generation." });
    }

    try {
        // Καλούμε το εξειδικευμένο μοντέλο για εικόνες
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image", // Μοντέλο για Image Generation
            contents: prompt,
            config: {
                responseModalities: ["TEXT", "IMAGE"], 
            },
        });
        
        // Βρίσκουμε το κομμάτι που περιέχει τα δεδομένα της εικόνας (Base64)
        const imagePart = response.candidates[0]?.content.parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

        if (imagePart) {
             // Επιστρέφουμε τα Base64 δεδομένα της εικόνας και τον MIME τύπο
            res.json({ 
                image: imagePart.inlineData.data, 
                mimeType: imagePart.inlineData.mimeType,
                text: response.text // Συνοδευτικό κείμενο (αν υπάρχει)
            }); 
        } else {
            res.status(500).json({ error: "Image generation successful, but image data not found in response." });
        }
        
    } catch (error) {
        console.error("Gemini Image Error:", error);
        // Ελέγχουμε για σφάλματα ορίων χρήσης
        if (error.message && error.message.includes('429')) {
             return res.status(429).json({ error: "Quota limit exceeded for Gemini API." });
        }
        res.status(500).json({ error: "Server error during Gemini Image call." });
    }
});


// 4. Εκκίνηση Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
