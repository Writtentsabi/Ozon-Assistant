// server.js (Πλήρης και Διορθωμένη Έκδοση)
import 'dotenv/config';
import express from 'express';
import {
	GoogleGenAI
} from "@google/genai";
import {
	Buffer
} from 'buffer';
import PaxSenixAI from '@paxsenix/ai';

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});

const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας (Safety Settings) όπως ορίστηκαν από τον χρήστη
const safety = [{
	category: "HARM_CATEGORY_HARASSMENT",
	threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_NONE",
	},
];


app.use(express.static('public'));
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

const IMAGE_SYSTEM_INSTRUCTION = `You are the image generation engine for OxyZen Browser. 

CRITICAL RULES:
1. LANGUAGE: If the user's prompt is not in English, translate the core visual description into English before processing.
2. TRIGGER: Generate an image ONLY if the user explicitly asks for one (e.g., "φτιάξε μια εικόνα", "generate an image", "σχεδίασε", "create a photo", "draw").
3. REFUSAL: If the user is just chatting or asking a question without a request to create a visual, DO NOT generate an image. Instead, provide a brief text response in the user's language explaining that you are ready to create an image when they provide a description.
4. TRANSLATION: Your internal processing for the image generation tool must always be in English to ensure quality.`;

// 2. Endpoint για Πολυτροπική Συνομιλία + μονο κειμενο (Input: Images -> Output: Text)
app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history
	} = req.body;

	const chat = ai.chats.create({
		model: CHAT_MODEL,
		history: history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
			tools: [{
				googleSearch: {}
			}],
			safetySettings: safety,
		},
	});

	// Υπολογισμός tokens για το τρέχον ιστορικό συν το νέο μήνυμα
	const countResponse = await ai.models.countTokens({
		model: CHAT_MODEL,
  		contents: [...history, { role: 'user', parts: [{ text: prompt }] }],
	});

	try {
		if (!images ||!Array.isArray(images)) {
			const response = await chat.sendMessage({
				message:prompt
			});

			res.json({
				text: response.text,
				token: response.usageMetadata.totalTokenCount
			});
		} else {


			const imageParts = images.map(imgBase64 => ({
				inlineData: {
					data: imgBase64,
					mimeType: mimeType || "image/jpeg"
				}
			}));
			const response = await chat.sendMessage({
				message: [...imageParts, prompt]
			});

			res.json({
				text: response.text,
				token: response.usageMetadata.totalTokenCount
			});
		}
	
	} catch (error) {
		console.error("Zen Error:", error);
		res.status(500).json({
			error: "Server error:" + error
		});
	}
});

// 3. Endpoint για Παραγωγή Εικόνας (Image Generation)
app.post('/api/generate-image', async (req, res) => {
	const {
		prompt,
		images,
		mimeType,
		aspectRatio
	} = req.body;

	if (!prompt) {
		return res.status(400).json({
			error: "Το prompt είναι υποχρεωτικό."
		});
	}

	try {
		const contents = [{
			text: prompt
		}];

		if (images && Array.isArray(images)) {
			images.forEach(imgBase64 => {
				contents.push({
					inlineData: {
						data: imgBase64,
						mimeType: mimeType || "image/jpeg"
					}
				});
			});
		}

		const response = await ai.models.generateContent({
			model: IMAGE_MODEL,
			contents: contents,
			config: {
				systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
				responseModalities: ['IMAGE'],
				safetySettings: safety,
				imageConfig: {
					aspectRatio: aspectRatio || "1:1",
					personGeneration: "ALLOW"
				}
			}
		});

		// ΔΙΟΡΘΩΣΗ ΣΦΑΛΜΑΤΟΣ: Αφαίρεση του ?. πριν το ; και ενοποίηση των ||
		const candidate = response.candidates ? response.candidates[0]: null;
		const parts = candidate?.content?.parts;

		if (!parts || parts.length === 0) {
			const reason = candidate?.finishReason || "UNKNOWN";
			const safetyFeedback = response.promptFeedback?.blockReason || "";
			return res.status(500).json({
				error: `Το μοντέλο δεν επέστρεψε εικόνα. Αιτία: ${reason}. ${safetyFeedback}`
			});
		}

		const generatedImages = parts
		.filter(part => part.inlineData)
		.map(part => ({
			data: part.inlineData.data,
			mimeType: part.inlineData.mimeType
		}));

		if (generatedImages.length === 0) {
			return res.status(500).json({
				error: "Η απάντηση δεν περιείχε δεδομένα εικόνας."
			});
		}

		res.json({
			success: true,
			images: generatedImages,
			token: response.usageMetadata.totalTokenCount
		});

	} catch (error) {
		console.error("Image Generation Error:", error);
		res.status(500).json({
			error: "Σφάλμα κατά την παραγωγή: " + error.message
		});
	}
});

//4. Endpoint για δωρεαν παραγωγη chat
app.post('/api/paxsenix-chat', async (req, res) => {
	const {
                prompt, history
        } = req.body;

	try {
		const response = await paxsenix.createChatCompletion({
			model: 'gpt-3.5-turbo',
			messages:[
				{ role: 'system', content: SYSTEM_INSTRUCTION },
				{ role: 'user', content: prompt }
			]
		});

		res.json({
			text: response.text
		});

	} catch (error) {
		res.status(error.status).json({
			Status: error.status,
			Error: error.mesage,
			Data: error.data
		});

	}

});

app.post('/api/paxsenix-list', async (req, res) => {
   	try {
     		// Example 1: List available models
     		console.log('Listing available models...'); 
     		const models = await paxsenix.listModels(); 
     		res.json({
			text:`Available models: ${models.data.map(model => model.id).join(', ')}`
		});
     		console.log('-------------------');
	} catch (error) {
		res.status(error).json({
			error: "No response on getting models:" + error
		});
	}
});

app.post('/api/perchance', async (req, res) => {
	const {
		prompt,history
	} = req.body;
	const count = 5;

	try {
        	const response = await fetch(`https://perchance.org/api/generateList.php?generator=${prompt}&count=${count}`);

        	if (!response.ok) {
          		res.status(response.status).json({
				error:response.status
			});
        	}

        	const data = await response.json();

        	if (data && data.length > 0) {
			res.json({
				text: data
			});
        	} else {
			res.status(500).json({
				error: "No response available"
			});
        	}
	} catch (error) {
        	res.status(error).json({
			error: "Error fetching from Perchance:" + error
		});
    	}
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
