import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// --- ΡΥΘΜΙΣΗ ΜΟΝΤΕΛΩΝ ---
// Χρησιμοποιούμε το 2.0-flash που είναι το τελευταίο διαθέσιμο (αντί για 2.5 που δεν υπάρχει δημόσια ακόμα)
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 

// Για δημιουργία εικόνας, το SDK προτείνει Imagen 3. 
// Αν έχετε πρόσβαση σε ειδικό μοντέλο "gemini-2.5-flash-image", αλλάξτε το εδώ.
const IMAGE_MODEL = process.env.IMAGE_MODEL || "imagen-3.0-generate-001";

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

        // Προσθήκη εικόνων
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

        if (prompt) {
            messageParts.push({ text: prompt });
        }

        console.log(`Starting Chat with Brain Model: ${CHAT_MODEL}`);

        // Αρχικοποίηση Chat
        const chat = await client.chats.create({
            model: CHAT_MODEL,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
            history: history || [],
        });

        // --- SAFE SEND HANDLER ---
        // Ελέγχουμε ποια μέθοδος υπάρχει στο SDK για να αποφύγουμε το crash
        let result;
        if (typeof chat.send === 'function') {
            result = await chat.send(messageParts);
        } else if (typeof chat.sendMessage === 'function') {
            result = await chat.sendMessage(messageParts);
        } else {
            throw new Error("SDK Error: Neither 'send' nor 'sendMessage' exists on chat object.");
        }

        const functionCalls = result.functionCalls();

        // --- FUNCTION CALL HANDLING (IMAGE GENERATION) ---
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === "generate_image") {
                console.log(`Zen generating image using ${IMAGE_MODEL} for prompt:`, call.args.prompt);

                try {
                    // Κλήση του μοντέλου Εικόνας
                    const imageResponse = await client.models.generateImage({
                        model: IMAGE_MODEL, 
                        prompt: call.args.prompt,
                        config: {
                            numberOfImages: 1,
                            aspectRatio: "1:1",
                        }
                    });

                    const generatedImageBase64 = imageResponse.image.b64_json;

                    const htmlResponse = `
                        <div class="thought">User requested image generation using prompt: "${call.args.prompt}". Tool execution successful using ${IMAGE_MODEL}.</div>
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
                        text: `<div class="thought">Image generation failed.</div><p style="color:red;">Error creating image with model ${IMAGE_MODEL}. Details: ${imgError.message}</p>`,
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

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
