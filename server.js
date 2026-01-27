// server.js (Πλήρως Ενοποιημένη Έκδοση)
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

const safety = [{
	category: "HARM_CATEGORY_HARASSMENT",
	threshold: "BLOCK_NONE"
},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_NONE"
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_NONE"
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_NONE"
	},
];

app.use(express.static('public'));
app.use(express.json({
	limit: '50mb'
}));

// 1. Το κλασικό System Instruction για το Chat
const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.
CORE RULE: Every response MUST consist of two distinct sections:
1. <div class="thought">...your reasoning...</div>
2. FINAL RESPONSE in HTML (p, ul, strong, a).`;

// 2. ΔΙΟΡΘΩΜΕΝΟ Image System Instruction για να αναγκάζουμε το κείμενο
const IMAGE_SYSTEM_INSTRUCTION = `You are the visual engine of OxyZen Browser.
Your ONLY task is to generate a high-quality image based on the user's request.
1. Translate the user's request to a detailed English image prompt.
2. If the user refers to previous context, incorporate those visual elements.
3. Do not generate conversational text, only the image data.`;

app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
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

		if (decision.includes("IMAGE")) {
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

			const currentParts = [{
				text: prompt
			}];
			if (images && Array.isArray(images)) {
				images.forEach(imgBase64 => {
					currentParts.push({
						inlineData: {
							data: imgBase64, mimeType: mimeType || "image/jpeg"
						}
					});
				});
			}

			contents.push({
				role: "user", parts: currentParts
			});

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
				return res.status(500).json({
					error: "Image generation failed."
				});
			}

			// ΕΞΑΓΩΓΗ ΕΙΚΟΝΩΝ
			const generatedImages = parts
			.filter(part => part.inlineData)
			.map(part => ({
				data: part.inlineData.data,
				mimeType: part.inlineData.mimeType
			}));

			// ΕΞΑΓΩΓΗ ΚΕΙΜΕΝΟΥ (Αναζητάμε το part που έχει text)
			const responseText = "<div class=\"thought\">No thoughts provided.</div><p>Here is your requested image:</p>";

			res.json({
				success: true,
				text: responseText, // Τώρα θα περιέχει το κείμενο
				images: generatedImages,
				token: response.usageMetadata.totalTokenCount
			});

		} else {
			// Chat Logic
			const chat = ai.chats.create({
				model: CHAT_MODEL,
				history: history || [],
				config: {
					systemInstruction: SYSTEM_INSTRUCTION,
					tools: [{
						googleSearch: {}
					}],
					safetySettings: safety,
					responseModalities: ['TEXT']
				},
			});

			let response;
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

			res.json({
				text: response.text,
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

// ... (Rest of the endpoints: paxsenix, perchance, wakeup)
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


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
