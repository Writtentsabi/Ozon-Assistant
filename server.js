// server.js (Σταθερή Έκδοση με Έξυπνη Δρομολόγηση)
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

const genAI = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας από server(6).js
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

// --- Helper Logic Functions ---

async function getRouteIntent(prompt) {
	try {
		const model = genAI.getGenerativeModel({
			model: "gemini-2.5-flash-lite",
			systemInstruction: "Analyze user intent. If the user explicitly wants to generate, draw, or edit an image, reply ONLY with 'IMAGE'. Else reply ONLY with 'TEXT'."
		});
		const result = await model.generateContent(prompt);
		const responseText = result.response.text().trim().toUpperCase();
		return responseText.includes("IMAGE") ? "IMAGE": "TEXT";
	} catch (error) {
		console.error("Routing Error:", error);
		return "TEXT";
	}
}

async function chatWithLogic(prompt, history, images, mimeType) {
	const model = genAI.getGenerativeModel({
		model: CHAT_MODEL,
		systemInstruction: SYSTEM_INSTRUCTION,
		safetySettings: safety,
		tools: [{
			googleSearch: {}
		}]
	});

	const chat = model.startChat({
		history: history || []
	});

	let messagePayload;
	if (images && images.length > 0) {
		const imageParts = images.map(data => ({
			inlineData: {
				data, mimeType: mimeType || "image/jpeg"
			}
		}));
		messagePayload = [...imageParts,
			prompt];
	} else {
		messagePayload = prompt;
	}

	const result = await chat.sendMessage(messagePayload);
	return {
		text: result.response.text(),
		token: result.response.usageMetadata.totalTokenCount
	};
}

async function generateImageLogic(prompt, images, mimeType, aspectRatio = "1:1") {
	const model = genAI.getGenerativeModel({
		model: IMAGE_MODEL,
		systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
		safetySettings: safety
	});

	let contents = [{
		role: "user",
		parts: [{
			text: prompt
		}]
	}];
	if (images && images.length > 0) {
		images.forEach(data => {
			contents[0].parts.push({
				inlineData: {
					data, mimeType: mimeType || "image/jpeg"
				}
			});
		});
	}

	const result = await model.generateContent({
		contents,
		generationConfig: {
			responseModalities: ["IMAGE"],
			aspectRatio: aspectRatio,
			personGeneration: "ALLOW"
		}
	});

	const candidate = result.response.candidates ? result.response.candidates[0]: null;
	const parts = candidate?.content?.parts;

	if (!parts || parts.length === 0) {
		throw new Error(`No image returned. Reason: ${candidate?.finishReason}`);
	}

	const generatedImages = parts
	.filter(part => part.inlineData)
	.map(part => ({
		data: part.inlineData.data,
		mimeType: part.inlineData.mimeType
	}));

	return {
		success: true,
		images: generatedImages,
		token: result.response.usageMetadata.totalTokenCount
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
