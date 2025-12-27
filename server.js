import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ΠΡΟΣΟΧΗ: Χρησιμοποιήστε ένα υπάρχον μοντέλο (π.χ. gemini-1.5-flash)
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
        description: "Generates a new image. Use this ONLY when the user asks to create/draw something new.",
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
    console.log("--- New Request Received ---");
    const { prompt, history, images, mimeType } = req.body;

    // Logging για αποσφαλμάτωση
    console.log("Prompt:", prompt);
    console.log("Images received:", images ? images.length : 0);
    console.log("History items:", history ? history.length : 0);

    try {
        const model = ai.getGenerativeModel({ 
            model: MODEL_NAME,
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: tools
        });

        // Προετοιμασία των μερών του μηνύματος
        let messageParts = [];
        
        // 1. Προσθήκη εικόνων αν υπάρχουν (Base64)
        if (images && Array.isArray(images)) {
            images.forEach((base64Data, index) => {
                messageParts.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType || "image/jpeg"
                    }
                });
                console.log(`Image ${index + 1} added to messageParts`);
            });
        }

        // 2. Προσθήκη του κειμένου
        messageParts.push({ text: prompt });

        // Έναρξη Chat Session με το ιστορικό
        const chatSession = model.startChat({
            history: history || [],
        });

        const result = await chatSession.sendMessage(messageParts);
        const response = result.response;
        const responseText = response.text();

        // Έλεγχος για Function Call (Image Generation)
        const call = response.candidates[0].content.parts.find(p => p.functionCall);
        if (call && call.functionCall.name === "generate_image") {
            console.log("Function Call Triggered: generate_image");
            const { prompt: imgPrompt, aspect_ratio } = call.functionCall.args;

            const imgModel = ai.getGenerativeModel({ model: "gemini-2.5-flash-image" }); // Ή το μοντέλο που υποστηρίζει εικόνα
            const imgResult = await imgModel.generateContent([imgPrompt]); 
            
            // Σημείωση: Το Imagen (image generation) απαιτεί συχνά διαφορετικό endpoint ή μοντέλο (π.χ. 'imagen-3')
            // Εδώ επιστρέφουμε ένα placeholder ή το base64 αν το υποστηρίζει το tier σας
            return res.json({
                text: `<div class="thought">Generating image...</div><p>Δημιουργώ την εικόνα για εσάς...</p>`,
                type: "image_generation"
            });
        }

        console.log("Response sent successfully");
        res.json({
            text: responseText,
            type: "text"
        });

    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            message: error.message,
            stack: error.stack 
        });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
