import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Μοντέλα
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-image"; 

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// Tool Definition
const generateImageTool = {
    name: "generate_image",
    description: "Generates an image based on a text prompt. Use this ONLY when the user explicitly asks to create, generate, draw, or make an image.",
    parameters: {
        type: "OBJECT",
        properties: {
            prompt: {
                type: "STRING",
                description: "The detailed prompt to generate the image from."
            },
        },
        required: ["prompt"],
    },
};

const SYSTEM_INSTRUCTION = `
You are Zen, the OxyZen Browser assistant.
FORMATTING RULES:
1. You must ALWAYS output your response in raw HTML format.
2. START every response with a hidden thought block: <div class="thought">[Reasoning...]</div>
3. Then write the response to the user using HTML tags.
BEHAVIOR:
- If provided images, analyze them.
- If asked to CREATE an image, call 'generate_image'.
`;

function sanitizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory.map(item => ({
        role: item.role || 'user',
        parts: Array.isArray(item.parts) ? item.parts : [{ text: item.text || item.content || "" }]
    }));
}

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images, mimeType } = req.body;

    try {
        let messageParts = [];

        if (images && Array.isArray(images)) {
            images.forEach((base64Data) => {
                if (base64Data) {
                    messageParts.push({
                        inlineData: { data: base64Data, mimeType: mimeType || "image/jpeg" }
                    });
                }
            });
        }

        if (prompt?.trim()) {
            messageParts.push({ text: prompt });
        } else if (messageParts.length === 0) {
            messageParts.push({ text: " " }); 
        }

        const cleanHistory = sanitizeHistory(history);
        const model = client.getGenerativeModel({ 
            model: CHAT_MODEL,
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        const chat = model.startChat({
            history: cleanHistory,
            generationConfig: { temperature: 0.7 },
            tools: [{ functionDeclarations: [generateImageTool] }],
        });

        const result = await chat.sendMessage(messageParts);
        const response = result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === "generate_image") {
                console.log(`Generating image for:`, call.args.prompt);

                try {
                    // 1. Παραγωγή εικόνας
                    const imageResponse = await client.models.generateImage({
                        model: IMAGE_MODEL,
                        prompt: call.args.prompt,
                        config: { numberOfImages: 1, aspectRatio: "1:1" }
                    });

                    const generatedImageBase64 = imageResponse.image.b64_json;

                    // 2. ΚΡΙΣΙΜΟ: Αποστολή του Tool Result πίσω στο Chat Session
                    // Αυτό αποτρέπει το ContentUnion error
                    await chat.sendMessage([{
                        functionResponse: {
                            name: "generate_image",
                            response: { success: true, message: "Image generated successfully" }
                        }
                    }]);

                    const htmlResponse = `<div class="thought">Image generated via ${IMAGE_MODEL}.</div><p>Ορίστε η εικόνα που δημιούργησα για: <b>${call.args.prompt}</b></p>`;

                    return res.json({
                        text: htmlResponse,
                        generated_image: generatedImageBase64, // Συγχρονισμένο με την Java
                        type: "image_generated"
                    });

                } catch (imgError) {
                    console.error("Image Gen Error:", imgError);
                    
                    // Ενημέρωση του μοντέλου για το σφάλμα
                    await chat.sendMessage([{
                        functionResponse: {
                            name: "generate_image",
                            response: { success: false, error: imgError.message }
                        }
                    }]);

                    return res.json({
                        text: `<div class="thought">Failed to generate image.</div><p style="color:red;">Σφάλμα: ${imgError.message}</p>`,
                        type: "text"
                    });
                }
            }
        }

        res.json({
            text: response.text(),
            type: "text"
        });

    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
