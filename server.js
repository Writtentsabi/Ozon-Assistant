// server.js (Διορθωμένο για παραγωγή δομημένης HTML)

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

const SYSTEM_INSTRUCTION = "Your name is Zen, you are the personal assistant for the OxyZen Browser. An app uploaded also on Play Store. You MUST write your thought process or reasoning first inside a <div> tag with the class 'thought' (e.g., <div class='thought'>My thought process...</div>). The rest of your response MUST use structured HTML tags (e.g., <p>, <ul>, <strong>) which will be inserted directly into the page's innerHTML. Do not include <html> or <body> tags.";

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

// 2. Το API Endpoint για Συνομιλία (Text-Only Chat)
app.post('/api/chat', async (req, res) => {

	const prompt = req.body.prompt;

	const chat = ai.chats.create({
		model: "gemini-2.5-flash",
		history: req.body.history || [],
		config: {
			// **ΔΙΟΡΘΩΣΗ: Ενισχυμένη οδηγία για παραγωγή δομημένης HTML
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
		console.error("Ozor Error:", error);
		res.status(500).json({
			error: "Server error during Zen chat call."
		});
	}
});

//3. API ΓΙΑ CHAT ΜΕ ΚΑΙΝΟΥΡΙΟ ΜΟΝΤΕΛΟ
app.post('/api/advanced-chat', async (req, res) => {

	const prompt = req.body.prompt;

	const chat = ai.chats.create({
		model: "gemini-3.0-flash",
		history: req.body.history || [],
		config: {
			// **ΔΙΟΡΘΩΣΗ: Ενισχυμένη οδηγία για παραγω>
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
		console.error("Ozor Error:", error);
		res.status(500).json({
			error: "Server error during Zen advanced chat call"
		});
	}
});

// 4. ΤΟ ΝΕΟ API ENDPOINT ΓΙΑ ΕΙΚΟΝΕΣ + CHAT (Multimodal Chat)
app.post('/api/multimodal-chat', async (req, res) => {
	const {
		prompt, image, mimeType, history
	} = req.body;

	if (!image || !prompt) {
		return res.status(400).json({
			error: "Missing image data or prompt for multimodal chat."
		});
	}

	// Το Gemini Vision μοντέλο είναι το gemini-2.5-flash (ή το pro)
	const chat = ai.chats.create({
		model: "gemini-2.5-flash", // Υποστηρίζει Vision
		history: history || [],
		config: {
			// **ΔΙΟΡΘΩΣΗ: Ενισχυμένη οδηγία για παραγωγή δομημένης HTML
			systemInstruction: SYSTEM_INSTRUCTION,

		},
	});

	// Δημιουργία του αντικειμένου μέρους (Part Object) για το Gemini
	const imagePart = {
		inlineData: {
			data: image,
			mimeType: mimeType
		}
	};

	try {
		// Στέλνουμε το prompt και την εικόνα ως ξεχωριστά μέρη
		const messageParts = [imagePart,
			prompt];

		const response = await chat.sendMessage({
			message: messageParts,
		});

		res.json({
			text: response.text
		});

	} catch (error) {
		console.error("Zen Error:", error);
		res.status(500).json({
			error: "Server error during Zen multimodal chat call."
		});
	}
});

//5.API ΓΙΑ ΑΠΟΣΤΟΛΗ ΕΙΚΟΝΩΝ ΜΕ ΑΝΑΒΑΘΜΙΣΜΕΝΟ ΜΟΝΤΕΛΟ
app.post('/api/multimodal-chat', async (req, res) => {
	const {
		prompt,
		image,
		mimeType,
		history
	} = req.body;

	if (!image || !prompt) {
		return res.status(400).json({
			error: "Missing image data or prompt for multimodal chat."
		});
	}

	// Το Gemini Vision μοντέλο είναι το gemini-3-flash-preview
	const chat = ai.chats.create({
		model: "gemini-3-flash-preview", // Υποστηρίζει Vision
		history: history || [],
		config: {
			// **ΔΙΟΡΘΩΣΗ: Ενισχυμένη οδηγία για παραγωγή δομημένης HTML
			systemInstruction: SYSTEM_INSTRUCTION,

		},
	});

	// Δημιουργία του αντικειμένου μέρους (Part Object) για το Gemini
	const imagePart = {
		inlineData: {
			data: image,
			mimeType: mimeType
		}
	};

	try {
		// Στέλνουμε το prompt και την εικόνα ως ξεχωριστά μέρη
		const messageParts = [imagePart,
			prompt];

		const response = await chat.sendMessage({
			message: messageParts,
		});

		res.json({
			text: response.text
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
