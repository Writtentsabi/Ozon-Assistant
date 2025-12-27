import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// Ορισμός του API Key και αρχικοποίηση του SDK
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = `Your name is Zen, the OxyZen Browser assistant.
- If the user provides an image, ANALYZE it based on their question.
- If the user asks to CREATE an image, use the 'generate_image' tool.
- Always start with <div class="thought">...</div> for reasoning.`;

app.post('/api/chat', async (req, res) => {
    const { prompt, history, images, mimeType } = req.body;

    try {
        // Η ΣΩΣΤΗ ΜΕΘΟΔΟΣ: Καλούμε το getGenerativeModel από το genAI αντικείμενο
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Βεβαιωθείτε ότι το όνομα είναι σωστό
            systemInstruction: SYSTEM_INSTRUCTION 
        });

        let messageParts = [];
        
        // Προσθήκη εικόνων αν υπάρχουν
        if (images && Array.isArray(images)) {
            images.forEach(base64Data => {
                messageParts.push({
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType || "image/jpeg"
                    }
                });
            });
        }

        // Προσθήκη του κειμένου στο τέλος
        messageParts.push({ text: prompt });

        // Έναρξη Chat με το ιστορικό που έστειλε το Android
        const chatSession = model.startChat({
            history: history || [],
        });

        const result = await chatSession.sendMessage(messageParts);
        const responseText = result.response.text();

        res.json({
            text: responseText,
            type: "text"
        });

    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Zen running on port ${PORT}`));
