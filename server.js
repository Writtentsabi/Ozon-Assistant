// server.js

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer'; // Απαραίτητο για τη διαχείριση δυαδικών δεδομένων

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση του κλειδιού από το Render Environment
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// 1. Ρύθμιση για Static Files (HTML, CSS, Client JS)
app.use(express.static('public')); 
app.use(express.json());          

// 2. Το API Endpoint για Συνομιλία (Chat - Χρήση Gemini)
app.post('/api/chat', async (req, res) => {
    
    const prompt = req.body.prompt; 

    const chat = ai.chats.create({
        model: "gemini-2.5-flash", 
        history: req.body.history || [], 
        config: {
            systemInstruction: "Your name is Ozor, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You are interacting through an html website, so you should write your answers as an innerHTML",
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

// 3. ΤΟ API ENDPOINT ΓΙΑ ΔΗΜΙΟΥΡΓΙΑ ΕΙΚΟΝΩΝ (Gemini Imagen)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt for image generation." });
    }
    
    try {
        const response = await ai.models.generateImages({
            // Διορθωμένο μοντέλο για να λειτουργεί με την τρέχουσα έκδοση της βιβλιοθήκης
            model: 'gemini-2.5-flash-image', 
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
            }
        });

        const image = response.generatedImages[0].image.imageBytes;

        if (image) {
             return res.json({ 
                image: image, // Είναι ήδη Base64 string
                mimeType: "image/jpeg", 
                text: "Η εικόνα δημιουργήθηκε επιτυχώς μέσω του Gemini (Imagen)." 
            });
        } else {
            return res.status(500).json({ error: "Gemini API failed to generate image bytes." });
        }

    } catch (error) {
        console.error("Gemini Imagen Error:", error);
        res.status(500).json({ error: "Server error during Gemini Imagen call. Check GEMINI_API_KEY or usage limits." });
    }
});


// 4. Εκκίνηση Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
