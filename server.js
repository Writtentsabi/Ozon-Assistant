import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Ορισμός του μοντέλου από το .env (με fallback αν ξεχαστεί)
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// --- TOOL DEFINITION ---
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

// --- SYSTEM INSTRUCTION ---
const SYSTEM_INSTRUCTION = `
You are Zen, the OxyZen Browser assistant.

FORMATTING RULES:
1. You must ALWAYS output your response in raw HTML format.
2. START every response with a hidden thought block exactly like this:
   <div class="thought">
   [Internal reasoning and analysis]
   </div>
3. After the thought block, write the response to the user using HTML tags (<p>, <ul>, <b>, etc).

BEHAVIOR:
- If the user provides images, ANALYZE them based on the prompt.
- If the user asks to GENERATE or CREATE an image, call the 'generate_image' tool.
`;

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images, mimeType } = req.body;

    try {
        let messageParts = [];

        // Προσθήκη λίστας εικόνων
        if (images && Array.isArray(images) && images.length > 0) {
            images.forEach((base64Data) => {
                messageParts.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType || "image/jpeg"
                    }
                });
            });
        }

        // Προσθήκη κειμένου
        if (prompt) {
            messageParts.push({ text: prompt });
        }

        console.log(`Using Model: ${CHAT_MODEL}`); // Log για επιβεβαίωση

        const chat = client.chats.create({
            model: CHAT_MODEL, // <--- ΕΔΩ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ Η ΜΕΤΑΒΛΗΤΗ ΑΠΟ ΤΟ .ENV
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
            history: history || [],
        });

        const result = await chat.send(messageParts);
        const functionCalls = result.functionCalls();

        // --- FUNCTION CALL HANDLING ---
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === "generate_image") {
                console.log("Zen generating image for:", call.args.prompt);

                try {
                    // Σημείωση: Το Imagen έχει δικό του μοντέλο, ανεξάρτητο από το Chat Model
                    const imageResponse = await client.models.generateImage({
                        model: "gemini-2.5-flash-image", 
                        prompt: call.args.prompt,
                        config: {
                            numberOfImages: 1,
                            aspectRatio: "1:1",
                        }
                    });

                    const generatedImageBase64 = imageResponse.image.b64_json;

                    // Manual HTML απάντηση για συνοχή
                    const htmlResponse = `
                        <div class="thought">User requested image generation using prompt: "${call.args.prompt}". Tool execution successful.</div>
                        <p>Here is the image I created for you based on: <b>${call.args.prompt}</b></p>
                    `;

                    return res.json({
                        text: htmlResponse,
                        image: generatedImageBase64,
                        type: "image_generated"
                    });

                } catch (imgError) {
                    console.error("Image Gen Error:", imgError);
                    return res.json({
                        text: `<div class="thought">Image generation failed.</div><p style="color:red;">Error creating image.</p>`,
                        type: "text"
                    });
                }
            }
        }

        // --- STANDARD RESPONSE ---
        res.json({
            text: result.text,
            type: "text"
        });

    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT} with model ${CHAT_MODEL}`));
