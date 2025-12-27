// server.js (Διορθωμένο)

import 'dotenv/config';
import express from 'express';
import {
	GoogleGenAI
} from "@google/genai";
import {
	Buffer
} from 'buffer';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ΑΣΦΑΛΕΙΑ: Χρήση του κλειδιού από το Render Environment
const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});

// 1. Ρύθμιση για Static Files (HTML, CSS, Client JS)
app.use(express.static('public'));

// ΔΙΟΡΘΩΣΗ: Αύξηση του ορίου μεγέθους του JSON body για να δεχτεί μεγάλες εικόνες (Base64)
app.use(express.json({
	limit: '50mb'
}));

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.
An app uploaded also on Play Store.

CORE RULE: Every response MUST consist of two distinct sections.

1. INTERNAL MONOLOGUE (The "Thought" process):
- You must start every response with a <div class="thought"> tag.
- In this section, analyze the user's intent, the context of the conversation, and your plan for the response.
- Reflect on potential nuances, tone requirements, or specific information needed from the user's prompt.
- This is your private reasoning space. Keep it analytical and objective.
- Close this section with </div>.

2. FINAL RESPONSE:
- Immediately after the thought block, provide your actual response to the user.
- Use structured HTML tags (e.g., <p>, <ul>, <strong>, <a>).
- Maintain a helpful, Zen-like, and professional personality.
- IMPORTANT: Do not include <html>, <head>, or <body> tags. 
- Ensure the tone matches the "OxyZen Browser" brand: calm, efficient, and user-centric.`;

// 2. Το API Endpoint για Συνομιλία (Text-Only Chat)
app.post('/api/chat', async (req, res) => {

	const prompt = req.body.prompt;

	const chat = ai.chats.create({
		model: MODEL_NAME,
		history: req.body.history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
		},
	});

	try {
		const response = await chat.sendMessage({
			message: prompt,
		});

		res.json({
			text: response.text
		});

	} catch (error) {
		console.error("Gemini Chat Error:", error);
		res.status(500).json({
			error: "Server error during Gemini chat call."
		});
	}
});

app.post('/api/multimodal-chat', async (req, res) => {
	const {
		prompt, images, mimeType, history // Αλλάζουμε το image σε images
	} = req.body;

	if (!images || !Array.isArray(images) || !prompt) {
		return res.status(400).json({
			error: "Πρέπει να στείλετε μια λίστα εικόνων (images array) και ένα prompt."
		});
	}

	const chat = ai.chats.create({
		model: MODEL_NAME,
		history: history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
		},
	});

	try {
		// Μετατρέπουμε κάθε base64 string της λίστας σε αντικείμενο inlineData
		const imageParts = images.map(imgBase64 => ({
			inlineData: {
				data: imgBase64,
				mimeType: mimeType || "image/jpeg"
			}
		}));

		// Προσθέτουμε το prompt στο τέλος της λίστας των μερών
		const messageParts = [...imageParts, prompt];

		const response = await chat.sendMessage({
			message: messageParts,
		});

		res.json({ text: response.text });

	} catch (error) {
		console.error("Gemini Multimodal Error:", error);
		res.status(500).json({ error: "Server error." });
	}
});

// 4. ΝΕΟ API ENDPOINT ΓΙΑ ΠΑΡΑΓΩΓΗ ΕΙΚΟΝΑΣ (Image Generation)
app.post('/api/generate-image', async (req, res) => {
    const { prompt, aspect_ratio = "1:1" } = req.body;

    if (!prompt) {
        return res.status(400).json({
            error: "Prompt is required for image generation."
        });
    }

    // Χρησιμοποιούμε το εξειδικευμένο μοντέλο για εικόνες
    const imageModel = "gemini-2.5-flash-image";

    try {
        const result = await ai.models.generateContent({
            model: imageModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Ενημερώνουμε το μοντέλο ότι περιμένουμε εικόνα
                responseModalities: ["IMAGE"],
                imageConfig: {
                    aspectRatio: aspect_ratio, // π.χ. "1:1", "16:9", "4:3"
                    numberOfImages: 1
                }
            }
        });

        // Το μοντέλο επιστρέφει την εικόνα σε Base64 μέσα στα parts
        const imagePart = result.response.candidates[0].content.parts.find(p => p.inlineData);

        if (imagePart) {
            res.json({
                image: imagePart.inlineData.data, // Το base64 string
                mimeType: imagePart.inlineData.mimeType
            });
        } else {
            throw new Error("No image was generated in the response.");
        }

    } catch (error) {
        console.error("Gemini Image Generation Error:", error);
        res.status(500).json({
            error: "Failed to generate image. " + error.message
        });
    }
});


app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
