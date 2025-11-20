// server.js

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση των κλειδιών από το Environment
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// 1. Ρύθμιση για Static Files
app.use(express.static('public')); 
app.use(express.json());          

// 2. Το API Endpoint για Συνομιλία (Chat - Χρήση Gemini)
app.post('/api/chat', async (req, res) => {
    
    const prompt = req.body.prompt; 

    const chat = ai.chats.create({
        model: "gemini-2.5-flash", 
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

// 3. Το API Endpoint για Δημιουργία Εικόνων (ΝΕΟ - ΧΡΗΣΗ Hugging Face)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt for image generation." });
    }
    
    // Απαιτείται το Hugging Face Token για εξουσιοδότηση
    const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

    if (!HUGGINGFACE_TOKEN) {
        return res.status(500).json({ error: "Hugging Face Token is not configured." });
    }

    // Το μοντέλο Stable Diffusion που θα χρησιμοποιήσουμε
    const modelUrl = 'https://router.huggingface.co/hf-inference/runwayml/stable-diffusion-v1-5';

    try {
        // Κλήση στο Hugging Face Inference API
        const response = await fetch(modelUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Χρήση Bearer Token
                "Authorization": `Bearer ${HUGGINGFACE_TOKEN}`,
            },
            body: JSON.stringify({
                inputs: prompt,
            }),
        });

        // Το Hugging Face επιστρέφει τη δυαδική εικόνα ως response (όχι JSON)
        if (response.ok) {
            
            // Διαβάζουμε το binary buffer της εικόνας
            const imageBuffer = await response.arrayBuffer();
            
            // Μετατρέπουμε το buffer σε Base64
            const base64Image = Buffer.from(imageBuffer).toString('base64');

             // Επιστρέφουμε τα Base64 δεδομένα και τον MIME τύπο
            res.json({ 
                image: base64Image, 
                mimeType: "image/jpeg", // Υποθέτουμε JPEG για τα Stable Diffusion μοντέλα
                text: "Η εικόνα δημιουργήθηκε επιτυχώς μέσω Hugging Face Inference API." 
            }); 
            
        } else {
            // Το Hugging Face μπορεί να επιστρέψει 400, 500, ή 503 (αναμονή/όριο)
            const errorText = await response.text();
            console.error("Hugging Face API Error:", response.status, errorText);
            return res.status(response.status).json({ 
                error: `External Image API failed (${response.status}): ${errorText.substring(0, 100)}` 
            });
        }
        
    } catch (error) {
        console.error("Image Generation Error:", error);
        res.status(500).json({ error: "Server error during image generation call." });
    }
});


// 4. Εκκίνηση Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
