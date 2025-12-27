import 'dotenv/config';
import express from 'express';
// Χρήση του νέου SDK σύμφωνα με τις οδηγίες μετάβασης
import { createClient } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Ρύθμιση Μοντέλων
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-image"; 

// Αρχικοποίηση Client στο νέο SDK
const client = createClient({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

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

        // Στο νέο SDK, το session ξεκινά απευθείας από το client.models
        const result = await client.models.generateContent({
            model: CHAT_MODEL,
            contents: [...cleanHistory, { role: 'user', parts: messageParts }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
        });

        const response = result.response;
        const call = response.candidates[0].content.parts.find(p => p.functionCall);

        if (call && call.functionCall.name === "generate_image") {
            const promptForImage = call.functionCall.args.prompt;
            console.log(`Generating image for:`, promptForImage);

            try {
                // Παραγωγή εικόνας με το νέο SDK
                const imageResponse = await client.models.generateImage({
                    model: IMAGE_MODEL,
                    prompt: promptForImage,
                    config: { numberOfImages: 1, aspectRatio: "1:1" }
                });

                const generatedImageBase64 = imageResponse.image.b64_json;

                // ΚΡΙΣΙΜΟ: Αποστολή Tool Response για αποφυγή ContentUnion error
                // Στο νέο SDK, στέλνουμε το αποτέλεσμα της συνάρτησης για να "κλείσει" η συναλλαγή
                const finalResult = await client.models.generateContent({
                    model: CHAT_MODEL,
                    contents: [
                        ...cleanHistory,
                        { role: 'user', parts: messageParts },
                        response.candidates[0].content, // Το function call του μοντέλου
                        {
                            role: 'tool',
                            parts: [{
                                functionResponse: {
                                    name: "generate_image",
                                    response: { success: true, message: "Image generated successfully" }
                                }
                            }]
                        }
                    ]
                });

                const htmlResponse = `<div class="thought">Generated image using ${IMAGE_MODEL}.</div><p>Ορίστε η εικόνα για: <b>${promptForImage}</b></p>`;

                return res.json({
                    text: htmlResponse,
                    generated_image: generatedImageBase64,
                    type: "image_generated"
                });

            } catch (imgError) {
                console.error("Image Gen Error:", imgError);
                return res.json({
                    text: `<div class="thought">Error generating image.</div><p style="color:red;">Error: ${imgError.message}</p>`,
                    type: "text"
                });
            }
        }

        // Κανονική απάντηση κειμένου
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
