import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// --- ΜΟΝΤΕΛΑ (Όπως τα ζητήσατε) ---
// ΠΡΟΣΟΧΗ: Αν το 2.5 δεν είναι ενεργό στο API Key σας, θα πετάξει 404. 
// Σε αυτή την περίπτωση γυρίστε το σε "gemini-2.0-flash".
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image"; 

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

/**
 * ΒΟΗΘΗΤΙΚΗ ΣΥΝΑΡΤΗΣΗ: Καθαρίζει το ιστορικό για να αποφύγουμε το "ContentUnion error"
 * Μετατρέπει τα δεδομένα στην ακριβή μορφή που θέλει το SDK:
 * { role: "user"|"model", parts: [{ text: "..." }] }
 */
function sanitizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];

    return rawHistory.map(item => {
        // Αν λείπει το role, υποθέτουμε 'user'
        const role = item.role || 'user';
        
        let parts = [];
        
        // Αν το parts είναι ήδη array, το κρατάμε (φιλτράροντας κενά)
        if (Array.isArray(item.parts)) {
            parts = item.parts;
        } 
        // Αν υπάρχει 'text' αντί για parts (παλιά δομή)
        else if (item.text) {
            parts = [{ text: item.text }];
        }
        // Αν υπάρχει 'content' (OpenAI δομή)
        else if (item.content) {
            parts = [{ text: item.content }];
        }

        return { role, parts };
    });
}

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images, mimeType } = req.body;

    try {
        let messageParts = [];

        // 1. Προσθήκη εικόνων
        if (images && Array.isArray(images) && images.length > 0) {
            images.forEach((base64Data) => {
                if (base64Data) { // Έλεγχος ότι δεν είναι null
                    messageParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType || "image/jpeg"
                        }
                    });
                }
            });
        }

        // 2. Προσθήκη κειμένου (Έλεγχος ότι δεν είναι κενό)
        if (prompt && typeof prompt === 'string' && prompt.trim() !== '') {
            messageParts.push({ text: prompt });
        } else if (messageParts.length === 0) {
            // Αν δεν έχουμε ούτε εικόνα ούτε κείμενο, στέλνουμε ένα κενό διάστημα για να μην σκάσει
            messageParts.push({ text: " " }); 
        }

        console.log(`Using Chat Model: ${CHAT_MODEL}`);

        // 3. Καθαρισμός Ιστορικού
        const cleanHistory = sanitizeHistory(history);

        // 4. Δημιουργία Chat
        const chat = await client.chats.create({
            model: CHAT_MODEL,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
                tools: [{ functionDeclarations: [generateImageTool] }],
            },
            history: cleanHistory, 
        });

        // 5. Αποστολή μηνύματος
        let result;
        if (typeof chat.send === 'function') {
            result = await chat.send(messageParts);
        } else if (typeof chat.sendMessage === 'function') {
            result = await chat.sendMessage(messageParts);
        }

        const functionCalls = result.functionCalls();

        // 6. Διαχείριση Function Call (Εικόνα)
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === "generate_image") {
                console.log(`Zen generating image with ${IMAGE_MODEL} for:`, call.args.prompt);

                try {
                    // Χρήση του gemini-2.5-flash-image ή imagen
                    const imageResponse = await client.models.generateImage({
                        model: IMAGE_MODEL,
                        prompt: call.args.prompt,
                        config: {
                            numberOfImages: 1,
                            aspectRatio: "1:1",
                        }
                    });

                    // Στη νέα SDK το base64 είναι συνήθως εδώ
                    const generatedImageBase64 = imageResponse.image.b64_json;

                    const htmlResponse = `
                        <div class="thought">I have successfully generated the image using ${IMAGE_MODEL} as requested.</div>
                        <p>Here is the generated image for: <b>${call.args.prompt}</b></p>
                    `;

                    return res.json({
                        text: htmlResponse,
                        image: generatedImageBase64,
                        type: "image_generated"
                    });

                } catch (imgError) {
                    console.error("Image Gen Error:", imgError);
                    return res.json({
                        text: `<div class="thought">Failed to generate image.</div><p style="color:red;">Error: ${imgError.message}</p>`,
                        type: "text"
                    });
                }
            }
        }

        // 7. Κανονική Απάντηση
        res.json({
            text: result.text,
            type: "text"
        });

    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack 
        });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
