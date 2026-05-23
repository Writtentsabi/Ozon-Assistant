// server.js (Πλήρως Ενοποιημένη Έκδοση με Local Gemma Router & UI Tasks + Cloud Gemini Fallbacks)
import 'dotenv/config';
import express from 'express';
import {
	GoogleGenAI
} from "@google/genai";
import {
	Buffer
} from 'buffer';
import PaxSenixAI from '@paxsenix/ai';
import ollama from 'ollama'; // Ενσωμάτωση Ollama για το τοπικό Gemma

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});

const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας (Safety Settings)
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

// System Instructions
const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.

CORE RULES:
1. Every response MUST consist of two distinct sections:
- <div class="thought">...your reasoning...</div>
- FINAL RESPONSE in HTML (p, ul, strong, a).`;

// ΕΝΟΠΟΙΗΜΕΝΟ ENDPOINT: api/chat
app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
		// 1. Φάση Δρομολόγησης (Intelligent Routing) μέσω LOCAL GEMMA
		// deterministic επιλογή (temperature 0.0) για μέγιστη σταθερότητα
		const routerResponse = await ollama.generate({
			model: 'gemma2:2b',
			prompt: `Analyze the user input: "${prompt}".
			Respond with ONLY ONE of the following uppercase words based on the intent:
			- "IMAGE" if they want to generate, draw, or create an image/visual.
			- "NAVIGATE" if they want to open, launch, go to, or visit a specific website or URL.
			- "THEME" if they want to change, toggle, or set the theme or mode (dark/light/system).
			- "TOOLBAR" if they want to move or change the position of the toolbar/navbar to the top or bottom.
			- "SEARCH_ENGINE" if they want to change or set the default search engine to any website.
			- "BOOKMARK" if they want to add or save a website to their bookmarks or favorites.
			- "REMOVE_BOOKMARK" if they want to remove, delete, or clear a website from their bookmarks.
			- "TEXT" for any general question, conversation, chat, or web search request.

			Do not include punctuation, explanations, or markdown. Output exactly one word.`,
			options: {
				temperature: 0.0
			}
		});

		const decision = routerResponse.response.trim().toUpperCase();
		console.log(`[Local Gemma Router] Decision: ${decision}`);

		// 2. Εκτέλεση βάσει της απόφασης
		if (decision === "IMAGE") {
			// --- ΛΟΓΙΚΗ ΕΙΚΟΝΑΣ ΜΕ ΥΠΟΣΤΗΡΙΞΗ ΙΣΤΟΡΙΚΟΥ (Gemini Cloud) ---
			console.log("[Image Engine] Context-aware image generation triggered.");

			const contextChat = ai.chats.create({
				model: CHAT_MODEL,
				history: history || [],
				config: {
					systemInstruction: `You are an expert prompt expander for an image generation model.
					Analyze the conversation history and the user's latest request.
					Your task is to output a single, highly-detailed image generation prompt in English that captures the user's full intent, combining past context with the new request.

					CRITICAL RULES:
					- Output ONLY the final English prompt.
					- Do not include explanations, intro text, markdown formatting, or quotes.`
				}
			});

			const promptSynthesisResponse = await contextChat.sendMessage({
				message: prompt
			});
			const synthesizedPrompt = promptSynthesisResponse.text.trim();

			console.log(`[Image Engine] Synthesized Prompt from history: "${synthesizedPrompt}"`);

			const currentParts = [{
				text: synthesizedPrompt
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

			const response = await ai.models.generateContent({
				model: IMAGE_MODEL,
				contents: [{
					role: "user", parts: currentParts
				}],
				config: {
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
				token: response.usageMetadata?.totalTokenCount || 0
			});

		} else if (decision === "NAVIGATE") {
			// --- UI TASK: ΠΛΟΗΓΗΣΗ (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `Extract the website URL the user wants to open from this request: "${prompt}".
			Respond ONLY with a valid JSON object like this: {"url": "https://example.com"}.
			If no specific URL is provided, infer the most logical one. Include http:// or https://.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.1
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			return res.json({
				text: `<div class="thought">Gemma Local Routing...</div><p>Opening link: <a href="${parsed.url}" target="_blank">${parsed.url}</a></p>`,
				openUrl: parsed.url,
				token: 0
			});

		} else if (decision === "THEME") {
			// --- UI TASK: ΑΛΛΑΓΗ ΘΕΜΑΤΟΣ (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `Identify the target theme (dark, light, or system) from this request: "${prompt}".
			Respond ONLY with a valid JSON object like this: {"theme": "dark"}.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.0
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			return res.json({
				text: `<div class="thought">Gemma Local UI control...</div><p>Changing appearance to <strong>${parsed.theme} mode</strong>.</p>`,
				setTheme: parsed.theme,
				token: 0
			});

		} else if (decision === "TOOLBAR") {
			// --- UI TASK: ΘΕΣΗ TOOLBAR (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `Identify the target toolbar position (top or bottom) from this request: "${prompt}".
			Respond ONLY with a valid JSON object like this: {"position": "top"}.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.0
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			const greekPosition = parsed.position === "top" ? "κορυφή": "πάτο";
			return res.json({
				text: `<div class="thought">Gemma Local UI control...</div><p>Μετακίνηση του toolbar στην <strong>${greekPosition}</strong> της σελίδας.</p>`,
				setToolbarPosition: parsed.position,
				token: 0
			});

		} else if (decision === "SEARCH_ENGINE") {
			// --- UI TASK: ΜΗΧΑΝΗ ΑΝΑΖΗΤΗΣΗΣ (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `The user wants to change their search engine: "${prompt}".
			Identify the engine name and create its standard search URL template using '%s' for the query placeholder.
			Respond ONLY with a valid JSON object like this: {"engine": "youtube", "searchUrl": "https://www.youtube.com/results?search_query=%s"}.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.1
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			return res.json({
				text: `<div class="thought">Gemma Local Configuration...</div><p>Η προεπιλεγμένη αναζήτηση ορίστηκε μέσω <strong>${parsed.engine}</strong>.</p>`,
				setSearchEngine: parsed.engine,
				searchUrlTemplate: parsed.searchUrl,
				token: 0
			});

		} else if (decision === "BOOKMARK") {
			// --- UI TASK: ΠΡΟΣΘΗΚΗ ΣΕΛΙΔΟΔΕΙΚΤΗ (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `Extract the title and full URL for a bookmark from this request: "${prompt}".
			If the user doesn't provide a full URL, infer the most logical one.
			Respond ONLY with a valid JSON object like this: {"title": "Google", "url": "https://google.com"}.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.1
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			return res.json({
				text: `<div class="thought">Gemma Local Bookmarks...</div><p>Η ιστοσελίδα <strong>${parsed.title}</strong> προστέθηκε επιτυχώς στους σελιδοδείκτες σου!</p>`,
				addTitle: parsed.title,
				addUrl: parsed.url,
				token: 0
			});

		} else if (decision === "REMOVE_BOOKMARK") {
			// --- UI TASK: ΑΦΑΙΡΕΣΗ ΣΕΛΙΔΟΔΕΙΚΤΗ (Local Gemma JSON Extraction) ---
			const gemmaPrompt = `Extract the title or core keyword of the bookmark to remove from this request: "${prompt}".
			Respond ONLY with a valid JSON object like this: {"title": "Google"}.`;

			const gemmaRes = await ollama.generate({
				model: 'gemma2:2b',
				prompt: gemmaPrompt,
				format: 'json',
				options: {
					temperature: 0.0
				}
			});

			const parsed = JSON.parse(gemmaRes.response);
			return res.json({
				text: `<div class="thought">Gemma Local Bookmarks...</div><p>Ο σελιδοδείκτης <strong>${parsed.title}</strong> αφαιρέθηκε.</p>`,
				removeTitle: parsed.title,
				token: 0
			});

		} else {
			// --- ΛΟΓΙΚΗ ΑΠΛΗΣ ΣΥΝΟΜΙΛΙΑΣ & SEARCH (Gemini Cloud) ---
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

			return res.json({
				text: response.text,
				token: response.usageMetadata?.totalTokenCount || 0
			});
		}

	} catch (globalError) {
		console.warn("🚨 Σφάλμα διεργασίας. Ενεργοποίηση Καθολικού PaxSenix Fallback:", globalError.message);

		try {
			const paxResponse = await paxsenix.createChatCompletion({
				model: 'gpt-3.5-turbo',
				messages: [{
					role: 'system', content: SYSTEM_INSTRUCTION
				},
					{
						role: 'user', content: prompt
					}]
			});

			return res.json({
				text: paxResponse.choices[0].message.content,
				token: 0,
				fallbackUsed: true
			});

		} catch (paxError) {
			console.error("Fatal Error (Both Models failed):", paxError);
			return res.status(500).json({
				error: "Όλες οι υπηρεσίες τεχνητής νοημοσύνης είναι προσωρινά μη διαθέσιμες."
			});
		}
	}
});

// Endpoint PaxSenix
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

// Endpoint Perchance
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
