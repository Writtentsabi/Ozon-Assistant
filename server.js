// server.js

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";
// Απαραίτητο για τη μετατροπή του binary response του Hugging Face σε Base64
import { Buffer } from 'buffer'; 

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση των κλειδιών από το Render Environment
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// Helper function για καθυστέρηση
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// 3. ΤΟ API ENDPOINT ΓΙΑ ΔΗΜΙΟΥΡΓΙΑ ΕΙΚΟΝΩΝ (Hugging Face - ΔΙΟΡΘΩΜΕΝΟ)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt for image generation." });
    }
    
    const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

    if (!HUGGINGFACE_TOKEN) {
        return res.status(500).json({ error: "Hugging Face Token is not configured." });
    }

    // Διορθωμένο URL και μοντέλο (Stable Diffusion v1-4)
    const modelUrl = 'https://router.huggingface.co/models/CompVis/stable-diffusion-v1-4';

    // Ρυθμίσεις Επανάληψης
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
        attempts++;
        try {
            const response = await fetch(modelUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${HUGGINGFACE_TOKEN}`,
                },
                body: JSON.stringify({
                    inputs: prompt,
                }),
            });

            // 1. ΕΠΙΤΥΧΙΑ (200 OK)
            if (response.ok) {
                const imageBuffer = await response.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                
                return res.json({ 
                    image: base64Image, 
                    mimeType: "image/jpeg", 
                    text: `Η εικόνα δημιουργήθηκε επιτυχώς (Δοκιμή ${attempts}).` 
                });
            } 
            
            // 2. ΣΦΑΛΜΑ 503 (Μοντέλο φορτώνει - Spin Up)
            if (response.status === 503 && attempts < maxRetries) {
                const errorBody = await response.json();
                let waitTime = 15000; // Προεπιλογή: 15 δευτερόλεπτα
                
                if (errorBody.estimated_time) {
                    waitTime = Math.max(waitTime, errorBody.estimated_time * 1000 + 5000);
                }

                console.log(`Model loading (503). Retrying in ${waitTime / 1000}s. Attempt ${attempts}/${maxRetries}`);
                await sleep(waitTime);
                continue; 
            }

            // 3. ΑΛΛΟ ΣΦΑΛΜΑ (π.χ., 401, 404, 402)
            const errorText = await response.text();
            console.error("Hugging Face API Error:", response.status, errorText);
            
            // Επιστρέφουμε αμέσως το σφάλμα στον client αν δεν είναι 503
            return res.status(response.status).json({ 
                error: `External Image API failed (${response.status} - Δοκιμή ${attempts}): ${errorText.substring(0, 100)}` 
            });
            
        } catch (error) {
            console.error(`Attempt ${attempts} failed:`, error);
            if (attempts === maxRetries) {
                return res.status(500).json({ error: "Server error during image generation call, max retries reached." });
            }
            await sleep(10000); 
        }
    }
    return res.status(500).json({ error: "Image generation failed after all retries." });
});


// 4. Εκκίνηση Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
