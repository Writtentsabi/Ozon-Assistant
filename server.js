import 'dotenv/config';
import express from 'express';
// Χρήση της σωστής κλάσης από το @google/genai
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Ρύθμιση Μοντέλων
// Προσοχή: Αν το gemini-2.5 δεν είναι διαθέσιμο, χρησιμοποιήστε το gemini-2.0-flash
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-image"; 

// Αρχικοποίηση Client σύμφωνα με το νέο SDK
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

        // Προσθήκη εικόνων αν υπάρχουν (Multimodal)
        if (images && Array.isArray(images)) {
            images.forEach((base64Data) => {
                if (base64Data) {
                    messageParts.push({
                        inlineData: { data: base64Data, mimeType: mimeType || "image/jpeg" }
                    });
                }
            });
        }

        // Προσθήκη κειμένου
        if (prompt?.trim()) {
            messageParts.push({ text: prompt });
        } else if (messageParts.length === 0) {
            messageParts.push({ text: " " }); 
        }

        const cleanHistory = sanitizeHistory(history);
        const currentMessage = { role: 'user', parts: messageParts };

        // 1. Πρώτη κλήση στο μοντέλο
        const result = await client.models.generateContent({
            model: CHAT_MODEL,
            contents: [...cleanHistory, currentMessage],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
        });

        const response = result.response;
        // Έλεγχος για Function Call (παραγωγή εικόνας)
        const call = response.candidates[0].content.parts.find(p => p.functionCall);

        if (call && call.functionCall.name === "generate_image") {
            const promptForImage = call.functionCall.args.prompt;
            console.log(`Generating image for:`, promptForImage);

            try {
                // 2. Παραγωγή εικόνας με το μοντέλο Imagen
                const imageResponse = await client.models.generateImage({
                    model: IMAGE_MODEL,
                    prompt: promptForImage,
                    config: { numberOfImages: 1, aspectRatio: "1:1" }
                });

                const generatedImageBase64 = imageResponse.image.b64_json;

                // 3. Η ΔΙΟΡΘΩΣΗ ΓΙΑ ΤΟ CONTENTUNION:
                // Πρέπει να στείλουμε το functionResponse πίσω στο session
                await client.models.generateContent({
                    model: CHAT_MODEL,
                    contents: [
                        ...cleanHistory,
                        currentMessage,
                        response.candidates[0].content, // Το αρχικό call του AI
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

                const htmlResponse = `<div class="thought">Image generated successfully.</div><p>Ορίστε η εικόνα που ζητήσατε για: <b>${promptForImage}</b></p>`;

                // Επιστροφή στον Android client
                return res.json({
                    text: htmlResponse,
                    generated_image: generatedImageBase64, // Συγχρονισμένο με AssistantActivity.java
                    type: "image_generated"
                });

            } catch (imgError) {
                console.error("Image Gen Error:", imgError);
                return res.json({
                    text: `<div class="thought">Failed to generate image.</div><p style="color:red;">Σφάλμα κατά την παραγωγή: ${imgError.message}</p>`,
                    type: "text"
                });
            }
        }

        // 4. Κανονική απάντηση κειμένου αν δεν κλήθηκε εργαλείο
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
