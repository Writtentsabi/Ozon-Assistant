// server.js (Πλήρως διορθωμένο για το νέο @google/genai SDK)

import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';
import * as fs from "node:fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Το SYSTEM_INSTRUCTION για την καθοδήγηση της Zen
const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// 1. Ρύθμιση για Static Files και JSON
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// Βοηθητική συνάρτηση για την εξαγωγή κειμένου και σκέψεων (thoughts) από το response
function processGenAIResponse(result) {
    let text = "";
    let thoughts = "";

    // Στο νέο SDK, το result.candidates[0].content.parts περιέχει την απάντηση
    if (result.candidates && result.candidates[0].content.parts) {
        for (const part of result.candidates[0].content.parts) {
            if (part.thought) {
                thoughts += part.text;
            } else if (part.text) {
                text += part.text;
            }
        }
    }
    
    // Αν για κάποιο λόγο δεν βρέθηκαν parts, χρησιμοποιούμε το result.text
    return {
        text: text || result.text || "",
        thoughts: thoughts
    };
}

// 2. API Endpoint: Standard Chat (Gemini 2.5 Flash)
app.post('/api/chat', async (req, res) => {
    try {
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            history: req.body.history || [],
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });

        // Απευθείας αποστολή του prompt ως string
        const result = await chat.sendMessage(req.body.prompt);
        
        res.json({ text: result.text });
    } catch (error) {
        console.error("Zen Chat Error:", error);
        res.status(500).json({ error: "Server error during Zen chat call." });
    }
});

// 3. API Endpoint: Advanced Chat (Gemini 3 Flash - ΜΕ THINKING CONFIG)
app.post('/api/advanced-chat', async (req, res) => {
    try {
        const chat = ai.chats.create({
            model: "gemini-3-flash-preview",
            history: req.body.history || [],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                thinkingConfig: { includeThoughts: true },
            },
        });

        const result = await chat.sendMessage(req.body.prompt);
        const processed = processGenAIResponse(result);

        res.json({
            text: processed.text,
            thoughts: processed.thoughts
        });
    } catch (error) {
        console.error("Zen Advanced Chat Error:", error);
        res.status(500).json({ error: "Server error during Zen advanced chat call" });
    }
});

// 4. API Endpoint: Multimodal Chat (Gemini 2.5 Flash)
app.post('/api/multimodal-chat', async (req, res) => {
    const { prompt, image, mimeType, history } = req.body;

    if (!image || !prompt) {
        return res.status(400).json({ error: "Missing image data or prompt." });
    }

    try {
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            history: history || [],
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });

        const imagePart = {
            inlineData: { data: image, mimeType: mimeType }
        };

        // Στο νέο SDK, τα μέρη του μηνύματος μπαίνουν σε έναν πίνακα απευθείας
        const result = await chat.sendMessage([imagePart, prompt]);
        
        res.json({ text: result.text });
    } catch (error) {
        console.error("Zen Multimodal Error:", error);
        res.status(500).json({ error: "Server error during Zen multimodal chat call." });
    }
});

// 5. API Endpoint: Advanced Multimodal Chat (Gemini 3 Flash - ΜΕ THINKING CONFIG)
app.post('/api/advanced-multimodal-chat', async (req, res) => {
    const { prompt, image, mimeType, history } = req.body;

    if (!image || !prompt) {
        return res.status(400).json({ error: "Missing image data or prompt." });
    }

    try {
        const chat = ai.chats.create({
            model: "gemini-3-flash-preview",
            history: history || [],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                thinkingConfig: { includeThoughts: true },
            },
        });

        const imagePart = {
            inlineData: { data: image, mimeType: mimeType }
        };

        const result = await chat.sendMessage([imagePart, prompt]);
        const processed = processGenAIResponse(result);

        res.json({
            text: processed.text,
            thoughts: processed.thoughts
        });
    } catch (error) {
        console.error("Zen Advanced Multimodal Error:", error);
        res.status(500).json({ error: "Server error during Zen advanced multimodal chat call." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
