// server.js (Πλήρως Ενοποιημένη Έκδοση με Gemini 2.5 Flash-Lite Router - Έτοιμο για Render)
import 'dotenv/config';
import express from 'express';
import {
	GoogleGenAI,
	Type
} from "@google/genai";
import {
	Buffer
} from 'buffer';
import PaxSenixAI from '@paxsenix/ai';

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";
const ROUTER_MODEL = "gemini-2.5-flash-lite"; // Χρήση Flash-Lite για το Routing

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

// --- Προσθήκη στην κορυφή του αρχείου, κάτω από τα imports ---
const GOOGLE_TIMEOUT_MS = 8000; // 8 δευτερόλεπτα όριο για την Google

const withTimeout = (promise, ms = GOOGLE_TIMEOUT_MS) => {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(`Google API Node Timeout after ${ms}ms`)), ms))
	]);
};

// ΕΝΟΠΟΙΗΜΕΝΟ ENDPOINT: api/chat
app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
		console.log("[Router] Starting intelligent routing...");

		// 1. Φάση Δρομολόγησης με επιβολή Timeout
		const routerPromise = ai.models.generateContent({
			model: ROUTER_MODEL,
			contents: `Analyze the user input: "${prompt}". Categorize their intent.`,
			config: {
				systemInstruction: `You are a routing assistant for a web browser. Categorize the user's intent into exactly one of these uppercase options:
				- IMAGE (generate, draw, or create an image/visual)
				- NAVIGATE (open, launch, go to, or visit a specific website)
				- THEME (change or set the theme to dark, light, or system)
				- TOOLBAR (move or change toolbar position to top or bottom)
				- SEARCH_ENGINE (change or set the default search engine)
				- BOOKMARK (add or save a website to bookmarks)
				- REMOVE_BOOKMARK (remove or delete a website from bookmarks)
				- SCALE (change, set, increase, or decrease font size, UI scale, or zoom scale to 0, 1, 2, 3, 4, or 5)
				- TEXT (general question, chat, or web search request)`,
				responseMimeType: "application/json",
				responseSchema: {
					type: Type.OBJECT,
					properties: {
						decision: {
							type: Type.STRING,
							description: "The uppercase classification word."
						}
					},
					required: ["decision"]
				},
				temperature: 0.0
			}
		});

		// Εφαρμογή του timeout στον Router
		const routerResponse = await withTimeout(routerPromise, GOOGLE_TIMEOUT_MS);
		const routerJson = JSON.parse(routerResponse.text);
		const decision = routerJson.decision.trim().toUpperCase();
		console.log(`[Gemini Flash-Lite Router] Decision: ${decision}`);

		// 2. Εκτέλεση βάσει της απόφασης
		if (decision === "IMAGE") {
			console.log("[Image Engine] Context-aware image generation triggered.");

			const contextChat = ai.chats.create({
				model: CHAT_MODEL,
				history: history || [],
				config: {
					systemInstruction: `You are an expert prompt expander for an image generation model.
					Analyze the conversation history and the user's latest request.
					Your task is to output a single, highly-detailed image generation prompt in English that captures the user's full intent.
					CRITICAL RULES: Output ONLY the final English prompt. No markdown.`
				}
			});

			// Timeout στην σύνθεση του prompt
			const promptSynthesisResponse = await withTimeout(contextChat.sendMessage({
				message: prompt
			}), GOOGLE_TIMEOUT_MS);
			const synthesizedPrompt = promptSynthesisResponse.text.trim();

			console.log(`[Image Engine] Synthesized Prompt: "${synthesizedPrompt}"`);

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

			// Timeout στην δημιουργία εικόνας
			const imagePromise = ai.models.generateContent({
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

			const response = await withTimeout(imagePromise, 15000);

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

		} else if (decision === "NAVIGATE" || decision === "THEME" || decision === "TOOLBAR" || decision === "SEARCH_ENGINE" || decision === "BOOKMARK" || decision === "REMOVE_BOOKMARK" || decision === "SCALE") {

			// --- UI TASKS GROUP ---
			let systemPrompt = "";
			let responseSchemaObj = {};

			if (decision === "NAVIGATE") {
				systemPrompt = `Extract the destination URL. Respond ONLY with a valid JSON object. Example: {"url": "https://example.com"}.`;
				responseSchemaObj = {
					url: {
						type: Type.STRING
					}
				};
			} else if (decision === "THEME") {
				systemPrompt = `Identify the target theme (dark, light, or system). Respond ONLY with JSON. Example: {"theme": "dark"}.`;
				responseSchemaObj = {
					theme: {
						type: Type.STRING,
						enum: ["dark",
							"light",
							"system"]
					}
				};

			} else if (decision === "TOOLBAR") {
				systemPrompt = `Identify the toolbar position (top or bottom). Respond ONLY with JSON. Example: {"position": "top"}.`;
				responseSchemaObj = {
					position: {
						type: Type.STRING,
						enum: ["top",
							"bottom"]
					}
				};
			} else if (decision === "SEARCH_ENGINE") {
				systemPrompt = `Identify the requested search engine name and create its standard search URL template using '%s' for the query.`;
				responseSchemaObj = {
					engine: {
						type: Type.STRING
					},
					searchUrl: {
						type: Type.STRING
					}
				};
			} else if (decision === "BOOKMARK") {
				systemPrompt = `Extract the title and full URL for a bookmark. Respond ONLY with JSON.`;
				responseSchemaObj = {
					title: {
						type: Type.STRING
					},
					url: {
						type: Type.STRING
					}
				};
			} else if (decision === "REMOVE_BOOKMARK") {
				systemPrompt = `Extract the title or keyword of the bookmark to remove. Respond ONLY with JSON.`;
				responseSchemaObj = {
					title: {
						type: Type.STRING
					}
				};
			} else if (decision === "SCALE") {
				systemPrompt = `Identify the requested scale level. It MUST be an integer between 0 and 5 based on user input. If the user requests a value higher than 5, return 5. If they request lower than 0, return 0. Respond ONLY with JSON. Example: {"scale": 3}.`;
				responseSchemaObj = {
					scale: {
						type: Type.INTEGER
					}
				};
			}

			const uiPromise = ai.models.generateContent({
				model: ROUTER_MODEL,
				contents: `Process request: "${prompt}"`,
				config: {
					systemInstruction: systemPrompt,
					responseMimeType: "application/json",
					responseSchema: {
						type: Type.OBJECT,
						properties: responseSchemaObj,
						required: Object.keys(responseSchemaObj)
					}
				}
			});

			const uiResponse = await withTimeout(uiPromise, GOOGLE_TIMEOUT_MS);
			const parsed = JSON.parse(uiResponse.text);

			// Επιστροφή των κατάλληλων δεδομένων ανάλογα με την απόφαση
			if (decision === "NAVIGATE") {
				return res.json({
					text: `<div class="thought">Zen Auto-Routing...</div><p>Μετάβαση στον σύνδεσμο: <a href="${parsed.url}" target="_blank">${parsed.url}</a></p>`, openUrl: parsed.url, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "THEME") {
				return res.json({
					text: `<div class="thought">Zen UI Control...</div><p>Αλλαγή εμφάνισης σε <strong>${parsed.theme} mode</strong>.</p>`, setTheme: parsed.theme, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "TOOLBAR") {
				const greekPosition = parsed.position === "top" ? "κορυφή": "πάτο";
				return res.json({
					text: `<div class="thought">Zen UI Control...</div><p>Μετακίνηση του toolbar στην <strong>${greekPosition}</strong> της σελίδας.</p>`, setToolbarPosition: parsed.position, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "SEARCH_ENGINE") {
				return res.json({
					text: `<div class="thought">Zen Engine Configuration...</div><p>Η προεπιλεγμένη αναζήτηση ορίστηκε μέσω <strong>${parsed.engine}</strong>.</p>`, setSearchEngine: parsed.engine, searchUrlTemplate: parsed.searchUrl, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "BOOKMARK") {
				return res.json({
					text: `<div class="thought">Zen Bookmarks...</div><p>Η ιστοσελίδα <strong>${parsed.title}</strong> προστέθηκε επιτυχώς στους σελιδοδείκτες σου!</p>`, addTitle: parsed.title, addUrl: parsed.url, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "REMOVE_BOOKMARK") {
				return res.json({
					text: `<div class="thought">Zen Bookmarks...</div><p>Ο σελιδοδείκτης <strong>${parsed.title}</strong> αφαιρέθηκε.</p>`, removeTitle: parsed.title, token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			} else if (decision === "SCALE") {
				// Μετατροπή του string "0"-"5" σε κανονικό integer
				const finalScale = parseInt(parsed.scale, 10);

				return res.json({
					text: `<div class="thought">Zen UI Control...</div><p>Η κλίμακα της σελίδας ορίστηκε στο <strong>${finalScale}</strong>.</p>`,
					setScale: finalScale, // Στέλνει καθαρό αριθμό (π.χ. 3 αντί για "3")
					token: uiResponse.usageMetadata?.totalTokenCount || 0
				});
			}


		} else {
			// --- ΛΟΓΙΚΗ ΑΠΛΗΣ ΣΥΝΟΜΙΛΙΑΣ & SEARCH ---
			console.log("[Chat Engine] Standard chat or web search triggered.");

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

			let chatPromise;
			if (!images || !Array.isArray(images)) {
				chatPromise = chat.sendMessage({
					message: prompt
				});
			} else {
				const imageParts = images.map(imgBase64 => ({
					inlineData: {
						data: imgBase64, mimeType: mimeType || "image/jpeg"
					}
				}));
				chatPromise = chat.sendMessage({
					message: [...imageParts, prompt]
				});
			}

			// Επιβολή Timeout και στο Chat
			const response = await withTimeout(chatPromise, GOOGLE_TIMEOUT_MS);

			return res.json({
				text: response.text,
				token: response.usageMetadata?.totalTokenCount || 0
			});
		}

	} catch (globalError) {
		// Καθολικό PaxSenix Fallback λόγω σφάλματος ή Timeout
		console.warn("🚨 Ενεργοποίηση Καθολικού PaxSenix Fallback λόγω:", globalError.message);

		try {
			const paxResponse = await paxsenix.createChatCompletion({
				model: 'gpt-4o-mini',
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
			console.error("Fatal Error (Both Gemini and PaxSenix failed):", paxError);
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
