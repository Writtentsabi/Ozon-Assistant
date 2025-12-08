// server.js (Τροποποιημένο για Multimodal Chat)

import 'dotenv/config'; 
import express from 'express'; 
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const app = express();
const PORT = process.env.PORT || 3000;

// ΑΣΦΑΛΕΙΑ: Χρήση του κλειδιού από το Render Environment
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// 1. Ρύθμιση για Static Files (HTML, CSS, Client JS)
app.use(express.static('public')); 
app.use(express.json());          

// 2. Το API Endpoint για Συνομιλία (Text-Only Chat)
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

// 3. ΤΟ ΝΕΟ API ENDPOINT ΓΙΑ ΕΙΚΟΝΕΣ + CHAT (Multimodal Chat)
app.post('/api/multimodal-chat', async (req, res) => {
    const { prompt, image, mimeType, history } = req.body;

    if (!image || !prompt) {
        return res.status(400).json({ error: "Missing image data or prompt for multimodal chat." });
    }
    
    // Το Gemini Vision μοντέλο είναι το gemini-2.5-flash (ή το pro)
    const chat = ai.chats.create({
        model: "gemini-2.5-flash", // Υποστηρίζει Vision
        history: history || [], 
        config: {
            systemInstruction: "Your name is Ozor, you are the personal assistant for the OxyZen Browser. Analyze the provided image and respond to the user's prompt about it. Answer in Greek. Write your answers as an innerHTML.",
        },
    });
    
    // Δημιουργία του αντικειμένου μέρους (Part Object) για το Gemini
    const imagePart = {
        inlineData: {
            data: image,
            mimeType: mimeType 
        }
    };
    
    try {
        // Στέλνουμε το prompt και την εικόνα ως ξεχωριστά μέρη
        const messageParts = [imagePart, prompt];
        
        const response = await chat.sendMessage({
            message: messageParts,
        });

        res.json({ text: response.text }); 

    } catch (error) {
        console.error("Gemini Multimodal Error:", error);
        res.status(500).json({ error: "Server error during Gemini Multimodal chat call." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
