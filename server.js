// server.js

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";
// Υποθέτουμε ότι το περιβάλλον Node.js υποστηρίζει το παγκόσμιο fetch.
// Αν όχι, θα χρειαστείτε: import fetch from 'node-fetch'; 

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

// 3. Το API Endpoint για Δημιουργία Εικόνων (ΝΕΟ - ΧΡΗΣΗ DeepAI ως δωρεάν εναλλακτική)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt for image generation." });
    }

    try {
        // Κλήση στο DeepAI Text2Img API
        const response = await fetch("https://api.deepai.org/api/text2img", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Μπορείτε να προσθέσετε το κλειδί σας εδώ αν το DeepAI σας ζητήσει για καλύτερα μοντέλα:
                // 'Api-Key': process.env.DEEPAI_API_KEY, 
            },
            body: JSON.stringify({
                text: prompt,
            }),
        });

        if (!response.ok) {
            console.error("DeepAI API Error:", response.status, response.statusText);
            // Επιστροφή σφάλματος 429 αν υπερβεί το όριο (Rate Limit) του DeepAI
            if (response.status === 429) {
                 return res.status(429).json({ error: "Quota limit exceeded for the external Image API (DeepAI)." });
            }
            return res.status(response.status).json({ error: "External Image API failed: " + response.statusText });
        }

        const data = await response.json(); 
        
        // Το DeepAI επιστρέφει το URL της εικόνας
        if (data.output_url) {
            res.json({ 
                imageUrl: data.output_url, 
                text: "Η εικόνα δημιουργήθηκε επιτυχώς με Stable Diffusion (DeepAI)." 
            }); 
        } else {
            res.status(500).json({ error: "Image generation successful, but URL not found in response. " });
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
