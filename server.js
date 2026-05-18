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
	threshold: "BLOCK_ONLY_HIGH",
},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_ONLY_HIGH",
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_ONLY_HIGH",
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_ONLY_HIGH",
	},
];

app.use(express.static('public'));
app.use(express.json({
	limit: '50mb'
}));

// System Instructions - Από server (6).js
const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.

CORE RULES:
1. Every response MUST consist of two distinct sections:
- <div class="thought">...your reasoning...</div>
- FINAL RESPONSE in HTML (p, ul, strong, a).`

const IMAGE_SYSTEM_INSTRUCTION = `You are the image generation engine for OxyZen Browser.

CRITICAL RULES:
1. LANGUAGE: If the user's prompt is not in English, translate the core visual description into English before processing.
2. TRIGGER: Generate an image ONLY if the user explicitly asks for one (e.g., "φτιάξε μια εικόνα", "generate an image", "σχεδίασε", "create a photo", "draw").
3. REFUSAL: If the user is just chatting or asking a question without a request to create a visual, DO NOT generate an image. Instead, provide a brief text response in the user's language explaining that you are ready to create an image when they provide a description.
4. TRANSLATION: Your internal processing for the image generation tool must always be in English to ensure quality.`;

// Ορισμός του εργαλείου για το άνοιγμα συνδέσμων
const openUrlTool = {
	functionDeclarations: [{
		name: "open_url",
		description: "Opens a specific website or URL when the user explicitly requests to navigate or open a site (e.g., 'Go to YouTube', 'Άνοιξε το Google').",
		parameters: {
			type: "OBJECT",
			properties: {
				url: {
					type: "STRING",
					description: "The full destination URL to open (e.g., 'https://www.youtube.com', 'https://www.google.com'). Must include http:// or https://."
				}
			},
			required: ["url"]
		}
	}]
};

// ΕΝΟΠΟΙΗΜΕΝΟ ENDPOINT: api/chat με Καθολικό Fallback σε PaxSenix αν κρασάρει η Google
app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
		// 1. Φάση Δρομολόγησης (Intelligent Routing)
		const routerResult = await ai.models.generateContent({
			model: ROUTER_MODEL,
			contents: [{
				parts: [{
					text: `Analyze the user input: "${prompt}".
					- If the user wants to generate, draw, or create an image/visual, reply ONLY with "IMAGE".
					- If the user explicitly wants to open, launch, go to, or visit a specific website/URL (e.g., "Άνοιξε το YouTube", "Πήγαινέ με στο google.com", "open github"), reply ONLY with "NAVIGATE".
					- Otherwise, for any general question, chat, or web search request, reply ONLY with "TEXT".`
				}]
			}]
		});

		const decision = routerResult.text.trim().toUpperCase();

		// 2. Εκτέλεση βάσει της απόφασης
		if (decision.includes("IMAGE")) {
			// --- ΛΟΓΙΚΗ ΕΙΚΟΝΑΣ ---
			const contents = [];
			if (history && Array.isArray(history)) {
				history.forEach(msg => {
					contents.push({
						role: msg.role, parts: [{
							text: msg.parts[0].text
						}]
					});
				});
			}

			const currentParts = [{ text: prompt }];
			if (images && Array.isArray(images)) {
				images.forEach(imgBase64 => {
					currentParts.push({
						inlineData: {
							data: imgBase64, mimeType: mimeType || "image/jpeg"
						}
					});
				});
			}
			contents.push({ role: "user", parts: currentParts });

			const response = await ai.models.generateContent({
				model: IMAGE_MODEL,
				contents: contents,
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
				data: part.inlineData.data, mimeType: part.inlineData.mimeType
			}));

			return res.json({
				success: true,
				text: "Here is your requested image:",
				images: generatedImages,
				token: response.usageMetadata.totalTokenCount
			});

		} else if (decision.includes("NAVIGATE")) {
			// --- ΛΟΓΙΚΗ ΠΛΟΗΓΗΣΗΣ ---
			const response = await ai.models.generateContent({
				model: CHAT_MODEL,
				contents: [{
					role: "user", parts: [{ text: prompt }]
				}],
				config: {
					systemInstruction: "You are the OxyZen Browser navigator. Your ONLY job is to return a function call to 'open_url' for the website the user requested. Do not write text, do not write code blocks, just call the tool.",
					tools: [openUrlTool],
					safetySettings: safety,
				},
			});

			const candidatePart = response.candidates?.[0]?.content?.parts?.[0];

			if (candidatePart && candidatePart.functionCall) {
				const call = candidatePart.functionCall;
				if (call.name === "open_url") {
					const targetUrl = call.args.url;
					return res.json({
						text: `<div class="thought">Navigating to requested site...</div><p>Opening link: <a href="${targetUrl}" target="_blank">${targetUrl}</a></p>`,
						openUrl: targetUrl,
						token: response.usageMetadata?.totalTokenCount || 0
					});
				}
			}

			return res.json({
				text: `<div class="thought">Fallback navigation handling.</div><p>Opening link: <a href="${prompt}" target="_blank">${prompt}</a></p>`,
				openUrl: prompt.includes("http") ? prompt: `https://google.com/search?q=${encodeURIComponent(prompt)}`,
				token: response.usageMetadata?.totalTokenCount || 0
			});

		} else {
			// --- ΛΟΓΙΚΗ ΑΠΛΗΣ ΣΥΝΟΜΙΛΙΑΣ & SEARCH ---
			const chat = ai.chats.create({
				model: CHAT_MODEL,
				history: history || [],
				config: {
					systemInstruction: SYSTEM_INSTRUCTION,
					tools: [{ googleSearch: {} }],
					safetySettings: safety,
				},
			});

			let response;
			if (!images || !Array.isArray(images)) {
				response = await chat.sendMessage({ message: prompt });
			} else {
				const imageParts = images.map(imgBase64 => ({
					inlineData: { data: imgBase64, mimeType: mimeType || "image/jpeg" }
				}));
				response = await chat.sendMessage({ message: [...imageParts, prompt] });
			}

			return res.json({
				text: response.text,
				token: response.usageMetadata?.totalTokenCount || 0
			});
		}

	} catch (globalError) {
		// ΚΑΘΟΛΙΚΟ FALLBACK: Αν σκάσει ΟΠΟΙΟΔΗΠΟΤΕ βήμα της Google (λόγω του Billing Block 403)
		console.warn("🚨 Κρίσιμο σφάλμα Google API. Ενεργοποίηση Καθολικού PaxSenix Fallback:", globalError.message);
		
		try {
			// Άμεση κλήση του PaxSenix AI με τις σωστές οδηγίες εμφάνισης (SYSTEM_INSTRUCTION)
			const paxResponse = await paxsenix.createChatCompletion({
				model: 'gpt-3.5-turbo',
				messages: [
					{ role: 'system', content: SYSTEM_INSTRUCTION },
					{ role: 'user', content: prompt }
				]
			});

			return res.json({
				text: paxResponse.choices[0].message.content,
				token: 0,
				fallbackUsed: true
			});
            
		} catch (paxError) {
			console.error("Fatal Error (Both Gemini and PaxSenix failed):", paxError);
			return res.status(500).json({
				error: "Όλες οι υπηρεσίες τεχνητής νοημοσύνης είναι προσωρινά μη διαθέσιμες."
			});
		}
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
			text: response.choices[0].message.content
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
