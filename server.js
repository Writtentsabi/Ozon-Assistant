import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.
CORE RULE: Every response MUST start with <div class="thought">...</div> for your reasoning, followed by your structured HTML response.
Maintain a calm, professional, and Zen-like personality.`;

// Ορισμός του Εργαλείου για Παραγωγή Εικόνας
const tools = [
    {
        functionDeclarations: [
            {
                name: "generate_image",
                description: "Creates an image based on user description. Use this only when the user explicitly asks to create, draw, or generate an image.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        prompt: {
                            type: "STRING",
                            description: "A detailed English description of the image to be generated."
                        },
                        aspect_ratio: {
                            type: "STRING",
                            description: "The aspect ratio of the image.",
                            enum: ["1:1", "16:9", "4:3", "9:16"]
                        }
                    },
                    required: ["prompt"]
                }
            }
        ]
    }
];

// 1. Το Κύριο Endpoint (Chat + Intelligent Image Generation)
app.post('/api/chat', async (req, res) => {
    const { prompt, history } = req.body;

    const chat = ai.chats.create({
        model: MODEL_NAME,
        history: history || [],
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: tools, // Εδώ δίνουμε τη δυνατότητα στον Zen να "βλέπει" τη συνάρτηση
        },
    });

    try {
        const result = await chat.sendMessage({ message: prompt });
        const responseContent = result.response.candidates[0].content;
        
        // Έλεγχος αν το Gemini ζήτησε Function Call (δηλ. παραγωγή εικόνας)
        const call = responseContent.parts.find(p => p.functionCall);

        if (call && call.functionCall.name === "generate_image") {
            const { prompt: imgPrompt, aspect_ratio } = call.functionCall.args;
            
            console.log("Zen is generating an image for:", imgPrompt);

            // Κλήση του εξειδικευμένου Flash Image μοντέλου
            const imgResult = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [{ role: "user", parts: [{ text: imgPrompt }] }],
                config: {
                    responseModalities: ["IMAGE"],
                    imageConfig: { aspectRatio: aspect_ratio || "1:1" }
                }
            });

            const imagePart = imgResult.response.candidates[0].content.parts.find(p => p.inlineData);
            
            return res.json({
                text: `<div class="thought">The user wants an image. I have invoked the generation tool.</div>
                       <p>Βεβαίως. Δημιούργησα την εικόνα που ζητήσατε βασισμένος στην περιγραφή: <em>${imgPrompt}</em></p>`,
                image: imagePart.inlineData.data,
                type: "image_generation"
            });
        }

        // Απλή απάντηση κειμένου αν δεν χρειάζεται εικόνα
        res.json({
            text: result.response.text(),
            type: "text"
        });

    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Multimodal Endpoint (Ανάλυση εικόνας που ανεβάζει ο χρήστης)
app.post('/api/multimodal-chat', async (req, res) => {
    const { prompt, image, mimeType, history } = req.body;

    const chat = ai.chats.create({
        model: MODEL_NAME,
        history: history || [],
        config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    const imagePart = { inlineData: { data: image, mimeType: mimeType } };

    try {
        const result = await chat.sendMessage({ message: [imagePart, prompt] });
        res.json({ text: result.response.text() });
    } catch (error) {
        console.error("Multimodal Error:", error);
        res.status(500).json({ error: "Error processing image analysis." });
    }
});

app.listen(PORT, () => {
    console.log(`Zen Server running on port ${PORT}`);
});
