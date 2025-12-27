import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Χρήση μοντέλων από το .env
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
            prompt: { type: "STRING", description: "The prompt for the image." }
        },
        required: ["prompt"],
    },
};

const SYSTEM_INSTRUCTION = `You are Zen. Output ALWAYS in HTML. If asked for an image, call 'generate_image'.`;

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images } = req.body;

    try {
        console.log("--- Request Received ---");
        
        let messageParts = [];
        if (images && Array.isArray(images)) {
            images.forEach(img => messageParts.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
        }
        if (prompt) messageParts.push({ text: prompt });

        const cleanHistory = Array.isArray(history) ? history.map(item => ({
            role: item.role || 'user',
            parts: Array.isArray(item.parts) ? item.parts : [{ text: item.text || "" }]
        })) : [];

        // Κλήση στην Google
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

        const response = result.response;

        // 1. ΕΛΕΓΧΟΣ ΓΙΑ CANDIDATES (Πριν το response.text())
        if (!response || !response.candidates || response.candidates.length === 0) {
            console.error("No candidates in response. Check safety feedback.");
            return res.json({ 
                text: "<p>Το μοντέλο δεν επέστρεψε απάντηση (No Candidates). Δοκίμασε να αλλάξεις το μοντέλο σε 2.0-flash.</p>", 
                type: "text" 
            });
        }

        const candidate = response.candidates[0];
        const call = candidate.content.parts.find(p => p.functionCall);

        // 2. ΕΛΕΓΧΟΣ ΓΙΑ FUNCTION CALL (Εικόνα)
        if (call && call.functionCall.name === "generate_image") {
            const promptForImg = call.functionCall.args.prompt;
            try {
                const imageRes = await client.models.generateImage({
                    model: IMAGE_MODEL,
                    prompt: promptForImg,
                });

                const b64 = imageRes.image.b64_json;

                // ContentUnion Fix για να "κλείσει" το tool call
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
                    text: `<p>Η εικόνα δημιουργήθηκε: <b>${promptForImg}</b></p>`,
                    generated_image: b64,
                    type: "image_generated"
                });
            } catch (imgErr) {
                return res.json({ text: `<p>Σφάλμα εικόνας: ${imgErr.message}</p>`, type: "text" });
            }
        }

        // 3. ΧΡΗΣΗ ΤΟΥ RESPONSE.TEXT() ΜΕ ΑΣΦΑΛΕΙΑ
        res.json({
            text: response.text(),
            type: "text"
        });

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

