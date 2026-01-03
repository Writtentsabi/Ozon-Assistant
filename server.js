// server.js (Προσαρμοσμένο για @google/genai SDK)
import 'dotenv/config';
import express from 'express';
// Βεβαιώσου ότι έχεις κάνει: npm install @google/genai
import {
	GoogleGenAI
} from "@google/genai";
import {
	Buffer
} from 'buffer';
import PaxSenixAI from '@paxsenix/ai';

const app = express();
const PORT = process.env.PORT || 3000;

// Προσοχή: Χρησιμοποίησε ονόματα μοντέλων που υποστηρίζονται (π.χ. gemini-2.0-flash-exp)
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.0-flash-exp";

// 1. Αρχικοποίηση του Client (New SDK Style)
const genAI = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});
const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας (Προσαρμοσμένες για το config object του νέου SDK)
const safetySettings = [{
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

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.
An app uploaded also on Play Store.

CORE RULE: Every response MUST consist of two distinct sections.
1. INTERNAL MONOLOGUE (The "Thought" process):
- You must start every response with a <div class="thought"> tag.
- Analyze user intent and context. Close with </div>.
2. FINAL RESPONSE:
- Immediately after, provide response in structured HTML tags.
- Tone: Zen-like, calm, professional.`;

const IMAGE_SYSTEM_INSTRUCTION = `You are the image generation engine for OxyZen Browser.
1. LANGUAGE: Translate visual description to English.
2. TRIGGER: Only if explicitly asked.
3. REFUSAL: If no visual request, explain you are ready to create images.
4. TRANSLATION: Internal processing in English.`;

// --- Helper Logic Functions (New SDK Syntax) ---

async function getRouteIntent(prompt) {
	try {
		// Στο νέο SDK καλούμε απευθείας το models.generateContent
		const result = await genAI.models.generateContent({
			model: "gemini-2.0-flash-exp", // Χρήση ελαφρύ μοντέλου για routing
			config: {
				systemInstruction: "Analyze user intent. If the user explicitly wants to generate, draw, or edit an image, reply ONLY with 'IMAGE'. Else reply ONLY with 'TEXT'."
			},
			contents: [{
				role: 'user', parts: [{
					text: prompt
				}]
			}]
		});

		const responseText = result.text ? result.text().trim().toUpperCase(): "TEXT";
		return responseText.includes("IMAGE") ? "IMAGE": "TEXT";
	} catch (error) {
		console.error("Routing Error:", error);
		return "TEXT";
	}
}

async function chatWithLogic(prompt, history, images, mimeType) {
	// 2. Δημιουργία Chat Session με το νέο SDK
	const chat = genAI.chats.create({
		model: CHAT_MODEL,
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
			safetySettings: safetySettings,
			// Google Search tool integration (αν υποστηρίζεται από το μοντέλο στο νέο SDK)
			tools: [{
				googleSearch: {}
			}]
		},
		history: history || []
	});

	let messagePayload;
	if (images && images.length > 0) {
		// Μορφοποίηση εικόνας για το νέο SDK
		const imageParts = images.map(data => ({
			inlineData: {
				data: data,
				mimeType: mimeType || "image/jpeg"
			}
		}));
		messagePayload = [
			...imageParts,
			{
				text: prompt
			}];
	} else {
		messagePayload = [{
			text: prompt
		}];
	}

	// Αποστολή μηνύματος
	const result = await chat.send(messagePayload);

	return {
		text: result.text(),
		token: result.usageMetadata?.totalTokenCount || 0
	};
}

async function generateImageLogic(prompt, images, mimeType, aspectRatio = "1:1") {
	// 3. Image Generation Logic (χρησιμοποιώντας το Gemini multimodal capabilities)
	let parts = [{
		text: prompt
	}];

	if (images && images.length > 0) {
		images.forEach(data => {
			parts.push({
				inlineData: {
					data: data,
					mimeType: mimeType || "image/jpeg"
				}
			});
		});
	}

	const result = await genAI.models.generateContent({
		model: IMAGE_MODEL,
		config: {
			systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
			safetySettings: safetySettings,
			responseModalities: ["IMAGE"], // Κρίσιμο για να ζητήσουμε εικόνα
			generationConfig: {
				// Κάποιες παράμετροι μπαίνουν εδώ ανάλογα την έκδοση
				responseModalities: ["IMAGE"]
			}
		},
		contents: [{
			role: "user", parts: parts
		}]
	});

	// Χειρισμός απάντησης στο νέο SDK
	const candidate = result.candidates ? result.candidates[0]: null;
	const responseParts = candidate?.content?.parts;

	if (!responseParts || responseParts.length === 0) {
		throw new Error(`No image returned. Finish Reason: ${candidate?.finishReason}`);
	}

	const generatedImages = responseParts
	.filter(part => part.inlineData)
	.map(part => ({
		data: part.inlineData.data,
		mimeType: part.inlineData.mimeType
	}));

	return {
		success: true,
		images: generatedImages,
		token: result.usageMetadata?.totalTokenCount || 0
	};
}

// --- Endpoints ---

app.post('/api/zen-assistant', async (req, res) => {
	const {
		prompt, history, images, mimeType, aspectRatio
	} = req.body;
	if (!prompt) return res.status(400).json({
		error: "Prompt is required"
	});

	try {
		const intent = await getRouteIntent(prompt);
		console.log("Zen Decision:", intent);

		if (intent === "IMAGE") {
			const result = await generateImageLogic(prompt, images, mimeType, aspectRatio);
			res.json(result);
		} else {
			const result = await chatWithLogic(prompt, history, images, mimeType);
			res.json(result);
		}
	} catch (error) {
		console.error("Zen Assistant Error:", error);
		res.status(500).json({
			error: error.message
		});
	}
});

// Paxsenix Logic παραμένει ίδια (αφού είναι άλλη βιβλιοθήκη)
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
		res.status(error.status || 500).json({
			error: error.message
		});
	}
});

app.post('/api/paxsenix-list', async (req, res) => {
	try {
		const models = await paxsenix.listModels();
		res.json({
			text: `Available models: ${models.data.map(m => m.id).join(', ')}`
		});
	} catch (error) {
		res.status(500).json({
			error: "Error listing models: " + error.message
		});
	}
});

app.get('/api/wake', (req, res) => {
	res.status(200).json({
		status: "online", timestamp: new Date().toISOString()
	});
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
