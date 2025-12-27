import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Χρήση .env με fallback στο 2.5
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image"; 

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

const generateImageTool = {
    name: "generate_image",
    description: "Generates an image based on a text prompt.",
    parameters: {
        type: "OBJECT",
        properties: {
            prompt: { type: "STRING", description: "The detailed prompt for the image." }
        },
        required: ["prompt"],
    },
};

const SYSTEM_INSTRUCTION = `You are Zen. Output ALWAYS in HTML. If asked for an image, call 'generate_image'.`;

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images } = req.body;

    try {
        console.log("--- New Request ---");
        console.log("Model used:", CHAT_MODEL);

        let messageParts = [];
        if (images && Array.isArray(images)) {
            images.forEach(img => messageParts.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
        }
        if (prompt) messageParts.push({ text: prompt });

        const cleanHistory = Array.isArray(history) ? history.map(item => ({
            role: item.role || 'user',
            parts: Array.isArray(item.parts) ? item.parts : [{ text: item.text || "" }]
        })) : [];

        // 1. Κλήση στην Google
        const result = await client.models.generateContent({
            model: CHAT_MODEL,
            contents: [...cleanHistory, { role: 'user', parts: messageParts }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: [generateImageTool] }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            },
        });

        // --- DEBUGGING BLOCK START ---
        // Αυτό θα εμφανιστεί στα logs του Render/Termux
        console.log("--- API RESPONSE DEBUG ---");
        if (result.response && result.response.candidates) {
            console.log("Candidates found:", result.response.candidates.length);
            console.log("Response Text Snippet:", result.response.text().substring(0, 100));
        } else {
            console.log("NO CANDIDATES RETURNED!");
            console.log("Full JSON Response:", JSON.stringify(result.response, null, 2));
        }
        // --- DEBUGGING BLOCK END ---

        if (!result.response.candidates || result.response.candidates.length === 0) {
            return res.json({ text: "<p>Empty response from AI. Check logs for Safety/Region block.</p>", type: "text" });
        }

        const candidate = result.response.candidates[0];
        const call = candidate.content.parts.find(p => p.functionCall);

        if (call && call.functionCall.name === "generate_image") {
            const promptForImg = call.functionCall.args.prompt;
            console.log("Executing Tool: generate_image for", promptForImg);

            try {
                const imageRes = await client.models.generateImage({
                    model: IMAGE_MODEL,
                    prompt: promptForImg,
                });

                const b64 = imageRes.image.b64_json;

                // ContentUnion Fix (Κλείσιμο session)
                await client.models.generateContent({
                    model: CHAT_MODEL,
                    contents: [
                        ...cleanHistory,
                        { role: 'user', parts: messageParts },
                        candidate.content,
                        { role: 'tool', parts: [{ functionResponse: { name: "generate_image", response: { success: true } } }] }
                    ]
                });

                return res.json({
                    text: `<p>Δημιουργήθηκε: <b>${promptForImg}</b></p>`,
                    generated_image: b64,
                    type: "image_generated"
                });

            } catch (e) {
                console.error("Image Tool Error:", e.message);
                return res.json({ text: `<p>Image Error: ${e.message}</p>`, type: "text" });
            }
        }

        res.json({ text: result.response.text(), type: "text" });

    } catch (error) {
        console.error("CRITICAL SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server is active on port ${PORT}`));
