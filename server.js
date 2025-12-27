import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Χρησιμοποιήστε gemini-2.0-flash που είναι το πιο σταθερό αυτή τη στιγμή
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-image"; 

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

const generateImageTool = {
    name: "generate_image",
    description: "Generates an image based on a text prompt.",
    parameters: {
        type: "OBJECT",
        properties: {
            prompt: { type: "STRING", description: "Detailed prompt" },
        },
        required: ["prompt"],
    },
};

const SYSTEM_INSTRUCTION = `You are Zen. ALWAYS output HTML. If asked for an image, use generate_image.`;

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images } = req.body;

    try {
        let messageParts = [];
        if (images && Array.isArray(images)) {
            images.forEach(img => messageParts.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
        }
        if (prompt) messageParts.push({ text: prompt });

        const cleanHistory = Array.isArray(history) ? history.map(item => ({
            role: item.role || 'user',
            parts: Array.isArray(item.parts) ? item.parts : [{ text: item.text || "" }]
        })) : [];

        const currentMessage = { role: 'user', parts: messageParts };

        // Κλήση στο μοντέλο
        const result = await client.models.generateContent({
            model: CHAT_MODEL,
            contents: [...cleanHistory, currentMessage],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
        });

        // --- ΑΣΦΑΛΗΣ ΕΛΕΓΧΟΣ ΓΙΑ ΤΟ ΣΦΑΛΜΑ CANDIDATES ---
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
            throw new Error("Empty response from AI model. Check your API Key or Model name.");
        }

        const candidate = result.response.candidates[0];
        const call = candidate.content.parts.find(p => p.functionCall);

        if (call && call.functionCall.name === "generate_image") {
            const promptForImage = call.functionCall.args.prompt;
            
            try {
                const imageResponse = await client.models.generateImage({
                    model: IMAGE_MODEL,
                    prompt: promptForImage,
                });

                const generatedImageBase64 = imageResponse.image.b64_json;

                // Κλείσιμο του Function Call (ContentUnion fix)
                await client.models.generateContent({
                    model: CHAT_MODEL,
                    contents: [
                        ...cleanHistory,
                        currentMessage,
                        candidate.content,
                        {
                            role: 'tool',
                            parts: [{
                                functionResponse: {
                                    name: "generate_image",
                                    response: { success: true }
                                }
                            }]
                        }
                    ]
                });

                return res.json({
                    text: `<p>Η εικόνα δημιουργήθηκε για: <b>${promptForImage}</b></p>`,
                    generated_image: generatedImageBase64,
                    type: "image_generated"
                });

            } catch (imgErr) {
                return res.json({ text: `<p>Σφάλμα εικόνας: ${imgErr.message}</p>`, type: "text" });
            }
        }

        res.json({
            text: candidate.content.parts[0].text || "No response",
            type: "text"
        });

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
