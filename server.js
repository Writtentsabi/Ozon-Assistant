// server.js (Πλήρως Ενοποιημένη Έκδοση με Gemini 2.5 Flash-Lite Router)
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
const ROUTER_MODEL = "gemini-2.5-flash-lite";

const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});

const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας (Safety Settings) - Από server (6).js
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

// System Instructions - Από server (6).js
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

// ΕΝΟΠΟΙΗΜΕΝΟ ENDPOINT: api/chat
app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
		// 1. Φάση Δρομολόγησης (Intelligent Routing) χρησιμοποιώντας ai.models.generateContent
		const routerResult = await ai.models.generateContent({
			model: ROUTER_MODEL,
			contents: [{
				parts: [{
					text: `Analyze the user input: "${prompt}".
					If the user wants to generate, draw, or create an image/visual, reply ONLY with "IMAGE".
					Otherwise, reply ONLY with "TEXT".`
				}]
			}]
		});

		const decision = routerResult.text.trim().toUpperCase();

		// 2. Εκτέλεση βάσει της απόφασης
		if (decision.includes("IMAGE")) {
			// Δημιουργία περιεχομένου που περιλαμβάνει το ιστορικό για context
			const contents = [];

			// Προσθήκη ιστορικού (αν υπάρχει) για να έχει το μοντέλο το context της συζήτησης
			if (history && Array.isArray(history)) {
				history.forEach(msg => {
					contents.push({
						role: msg.role,
						parts: [{
							text: msg.parts[0].text
						}]
					});
				});
			}

			// Προσθήκη του τρέχοντος prompt και τυχόν εικόνων εισόδου
			const currentParts = [{
				text: prompt
			}];
			if (images && Array.isArray(images)) {
				images.forEach(imgBase64 => {
					currentParts.push({
						inlineData: {
							data: imgBase64,
							mimeType: mimeType || "image/jpeg"
						}
					});
				});
			}

			contents.push({
				role: "user",
				parts: currentParts
			});

			const response = await ai.models.generateContent({
				model: IMAGE_MODEL,
				contents: contents, // Τώρα περιλαμβάνει όλο το ιστορικό
				config: {
					systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
					responseModalities: ['IMAGE'],
					safetySettings: safety,
					imageConfig: {
						aspectRatio: aspectRatio || "1:1"
					}
				}
			});

			const candidate = response.candidates ? response.candidates[0]: null;
			const parts = candidate?.content?.parts;

			if (!parts || parts.length === 0) {
				const reason = candidate?.finishReason || "UNKNOWN";
				return res.status(500).json({
					error: `Image generation failed. Reason: ${reason}`
				});
			}

			const generatedImages = parts
			.filter(part => part.inlineData)
			.map(part => ({
				data: part.inlineData.data,
				mimeType: part.inlineData.mimeType
			}));

			res.json({
				success: true,
				images: generatedImages,
				token: response.usageMetadata.totalTokenCount
			});

		} else {
			// Λογική Πολυτροπικής Συνομιλίας με προσθήκη AUDIO
			const chat = ai.chats.create({
				model: CHAT_MODEL,
				history: history || [],
				config: {
					systemInstruction: SYSTEM_INSTRUCTION,
					tools: [{
						googleSearch: {}
					}],
					safetySettings: safety,
					// ΠΡΟΣΘΗΚΗ: Ζητάμε από το μοντέλο να παράγει και κείμενο και ήχο
					responseModalities: ["text", "audio"],
				},
			});

			let response;
			// (Το υπόλοιπο sendMessage παραμένει ίδιο)
			if (!images || !Array.isArray(images)) {
				response = await chat.sendMessage({
					message: prompt
				});
			} else {
				const imageParts = images.map(imgBase64 => ({
					inlineData: {
						data: imgBase64, mimeType: mimeType || "image/jpeg"
					}
				}));
				response = await chat.sendMessage({
					message: [...imageParts, prompt]
				});
			}

			// Εξαγωγή του ήχου από τα parts της απάντησης
			const audioPart = response.candidates[0].content.parts.find(part => part.inlineData);

			res.json({
				text: response.text,
				// Επιστρέφουμε το base64 audio data και το mimeType (συνήθως audio/pcm)
				audio: audioPart ? audioPart.inlineData.data: null,
				audioMimeType: audioPart ? audioPart.inlineData.mimeType: null,
				token: response.usageMetadata.totalTokenCount
			});
		}


	} catch (error) {
		console.error("Zen Unified Error:", error);
		res.status(500).json({
			error: "Server error: " + error.message
		});
	}
});

// Endpoint PaxSenix (Από server 6)
app.post('/api/paxsenix-chat', async (req, res) => {
	const {
		prompt
	} = req.body;
	try {
		const response = await paxsenix.createChatCompletion({
			model: 'gpt-3.5-turbo',
			messages: [{
				role: 'system', content: SYSTEM_INSTRUCTION
			},
				{
					role: 'user', content: prompt
				}]
		});
		res.json({
			text: response.text
		});
	} catch (error) {
		res.status(500).json({
			error: error.message
		});
	}
});

// Endpoint Perchance (Από server 6)
app.post('/api/perchance', async (req, res) => {
	const {
		prompt
	} = req.body;
	const count = 5;
	try {
		const response = await fetch(`https://perchance.org/api/generateList.php?generator=${prompt}&count=${count}`);
		if (!response.ok) return res.status(response.status).json({
			error: response.status
		});
		const data = await response.json();
		res.json({
			text: data
		});
	} catch (error) {
		res.status(500).json({
			error: "Error fetching from Perchance: " + error.message
		});
	}
});

// Endpoint για το "ξύπνημα" του server (Keep-alive / Health Check)
app.get('/api/wakeup', (req, res) => {
	res.status(200).json({
		status: "online",
		message: "Zen Server is awake and ready",
		timestamp: new Date().toISOString()
	});
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
