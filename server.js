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

const SYSTEM_INSTRUCTION = `Your name is Zen, the OxyZen Browser assistant.
- If the user provides an image, ANALYZE it based on their question.
- If the user asks to CREATE an image, use the 'generate_image' tool.
- Always start with <div class="thought">...</div> for reasoning.`;

const tools = [{
    functionDeclarations: [{
        name: "generate_image",
        description: "Generates a new image. Use this ONLY when the user asks to create/draw something new, NOT for analyzing existing images.",
        parameters: {
            type: "OBJECT",
            properties: {
                prompt: { type: "STRING", description: "English prompt for image generation." },
                aspect_ratio: { type: "STRING", enum: ["1:1", "16:9", "4:3", "9:16"] }
            },
            required: ["prompt"]
        }
    }]
}];

app.post('/api/chat', async (req, res) => {
    const { prompt, history, image, mimeType } = req.body;

    const chat = ai.chats.create({
        model: MODEL_NAME,
        history: history || [],
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: tools,
        },
    });

    try {
        // Κατασκευή του μηνύματος: Αν υπάρχει εικόνα, την προσθέτουμε στο request
        let messagePayload = prompt;
        if (image && mimeType) {
            messagePayload = [
                { inlineData: { data: image, mimeType: mimeType } },
                prompt
            ];
        }

        const result = await chat.sendMessage({ message: messagePayload });
        const responseContent = result.response.candidates[0].content;
        
        // 1. Έλεγχος για Function Call (Παραγωγή νέας εικόνας)
        const call = responseContent.parts.find(p => p.functionCall);
        if (call && call.functionCall.name === "generate_image") {
            const { prompt: imgPrompt, aspect_ratio } = call.functionCall.args;

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
                text: `<div class="thought">User wants a new image. Generating...</div><p>Ορίστε η εικόνα που δημιούργησα για εσάς!</p>`,
                image: imagePart.inlineData.data,
                type: "image_generation"
            });
        }

        // 2. Απλή απάντηση (Κείμενο ή Ανάλυση της εικόνας που ανέβηκε)
        res.json({
            text: result.response.text(),
            type: "text"
        });

    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
