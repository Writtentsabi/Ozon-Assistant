// server.js (Ενημερωμένο με Thinking Config για Gemini 3)

import 'dotenv/config';
import express from 'express';
import {
	GoogleGenAI
} from "@google/genai";
import {
	Buffer
} from 'buffer';
import * as fs from "node:fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Το SYSTEM_INSTRUCTION παραμένει για να καθοδηγεί τη δομή της HTML
const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

const ai = new GoogleGenAI({
	apiKey: process.env.GEMINI_API_KEY
});

// 1. Ρύθμιση για Static Files
app.use(express.static('public'));

// Όριο μεγέθους για Base64 εικόνες
app.use(express.json({
	limit: '50mb'
}));

// 2. API Endpoint: Standard Chat (Gemini 2.5 Flash - Δεν υποστηρίζει Thinking Config)
app.post('/api/chat', async (req, res) => {
	const prompt = req.body.prompt;
	const chat = ai.chats.create({
		model: "gemini-2.5-flash",
		history: req.body.history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
		},
	});

	try {
		const result = await chat.sendMessage({
			message: prompt,
		});
		res.json({
			text: result.response.text()
		});
	} catch (error) {
		console.error("Ozor Error:", error);
		res.status(500).json({
			error: "Server error during Zen chat call."
		});
	}
});

// 3. API Endpoint: Advanced Chat (Gemini 3 Flash - ΜΕ THINKING CONFIG)
app.post('/api/advanced-chat', async (req, res) => {
	const prompt = req.body.prompt;

	const chat = ai.chats.create({
		model: "gemini-3-flash-preview",
		history: req.body.history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
			// Ενεργοποίηση της παραγωγής σκέψεων
			thinkingConfig: {
				includeThoughts: true
			},
		},
	});

	try {
		const result = await chat.sendMessage({
			message: prompt,
		});

		// Επιστρέφουμε το κείμενο ΚΑΙ τα thoughts ξεχωριστά
		res.json({
			text: result.response.text(),
			thoughts: result.response.thoughts || "" 
		});
	} catch (error) {
		console.error("Ozor Error:", error);
		res.status(500).json({
			error: "Server error during Zen advanced chat call"
		});
	}
});

// 4. API Endpoint: Multimodal Chat (Gemini 2.5 Flash)
app.post('/api/multimodal-chat', async (req, res) => {
	const { prompt, image, mimeType, history } = req.body;

	if (!image || !prompt) {
		return res.status(400).json({ error: "Missing image data or prompt." });
	}

	const chat = ai.chats.create({
		model: "gemini-2.5-flash",
		history: history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
		},
	});

	const imagePart = {
		inlineData: { data: image, mimeType: mimeType }
	};

	try {
		const messageParts = [imagePart, prompt];
		const result = await chat.sendMessage({
			message: messageParts,
		});
		res.json({
			text: result.response.text()
		});
	} catch (error) {
		console.error("Zen Error:", error);
		res.status(500).json({
			error: "Server error during Zen multimodal chat call."
		});
	}
});

// 5. API Endpoint: Advanced Multimodal Chat (Gemini 3 Flash - ΜΕ THINKING CONFIG)
app.post('/api/advanced-multimodal-chat', async (req, res) => {
	const { prompt, image, mimeType, history } = req.body;

	if (!image || !prompt) {
		return res.status(400).json({ error: "Missing image data or prompt." });
	}

	const chat = ai.chats.create({
		model: "gemini-3-flash-preview",
		history: history || [],
		config: {
			systemInstruction: SYSTEM_INSTRUCTION,
			// Ενεργοποίηση της παραγωγής σκέψεων για Vision tasks
			thinkingConfig: {
				includeThoughts: true
			},
		},
	});

	const imagePart = {
		inlineData: { data: image, mimeType: mimeType }
	};

	try {
		const messageParts = [imagePart, prompt];
		const result = await chat.sendMessage({
			message: messageParts,
		});

		res.json({
			text: result.response.text(),
			thoughts: result.response.thoughts || ""
		});
	} catch (error) {
		console.error("Zen Error:", error);
		res.status(500).json({
			error: "Server error during Zen advanced multimodal chat call."
		});
	}
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
