import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
	Innertube
} from 'youtubei.js';
import {
	GoogleGenAI,
	Type
} from "@google/genai";
import PaxSenixAI from '@paxsenix/ai';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";
const ROUTER_MODEL = "gemini-2.5-flash-lite";

const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});
const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ανάκτηση υπότιτλων (Transcript) από YouTube βίντεο
let youtubeClient = null;

// Αρχικοποίηση του Innertube client (μια φορά)
async function getYouTubeClient() {
	if (!youtubeClient) {
		youtubeClient = await Innertube.create();
	}
	return youtubeClient;
}

async function processYouTubeVideo(promptText) {
	const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
	const match = promptText.match(ytRegex);

	if (!match || !match[1]) return null;
	const videoId = match[1];

	try {
		console.log("Fetching YouTube transcript via Innertube for video:", videoId);
		const youtube = await getYouTubeClient();

		// Λήψη των πληροφοριών του βίντεο
		const info = await youtube.getInfo(videoId);

		// Λήψη των υποτίτλων (περιλαμβάνει αυτόματους ASR και χειροκίνητους)
		const transcriptData = await info.getTranscript();

		if (!transcriptData || !transcriptData.transcript || !transcriptData.transcript.content) {
			console.log(`[Info] No transcripts/captions available for video ${videoId}.`);
			return null;
		}

		// Εξαγωγή του κειμένου από τα body segments
		const segments = transcriptData.transcript.content.body?.initial_segments || [];
		const fullTranscriptText = segments
		.map(segment => segment.snippet?.text || '')
		.filter(text => text.length > 0)
		.join(' ');

		if (!fullTranscriptText) return null;

		console.log("Transcript fetched successfully (including auto-generated).");
		return fullTranscriptText;

	} catch (e) {
		console.log("Error fetching YouTube transcript with Innertube:", e.message);
		return null;
	}
}

const safety = [{
	category: "HARM_CATEGORY_HARASSMENT",
	threshold: "BLOCK_ONLY_HIGH"
},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_ONLY_HIGH"
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_ONLY_HIGH"
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_ONLY_HIGH"
	}];

app.use(express.static('public'));
app.use(express.json({
	limit: '50mb'
}));

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser.

CORE RULES:
1. Every response MUST consist of two distinct sections:
- <div class="thought">...your reasoning...</div>
- FINAL RESPONSE in HTML (p, ul, strong, a).
2. Do NOT wrap your entire response inside markdown code blocks. Return pure raw string.`;

const ROUTER_SYSTEM_INSTRUCTION = `You are an intent classification routing assistant for the OxyZen Web Browser.
Analyze the user's latest request in the context of the conversation history and classify their intent into EXACTLY ONE of the following uppercase decisions:

- IMAGE: Generate, draw, create, or modify an image or visual artwork.
- NAVIGATE: Explicit command to open, visit, launch, or go to a specific URL/website (e.g., "go to youtube.com", "open wikipedia").
- THEME: Explicit command to change or set the browser theme (dark, light, or system).
- TOOLBAR: Explicit command to move or change toolbar placement or status (top, bottom, show, hide).
- SEARCH_ENGINE: Explicit command to CHANGE OR SET the browser's default search engine setting (e.g., "change search engine to Google", "set default search to DuckDuckGo").
- BOOKMARK: Explicit command to save/add the current page or a URL to bookmarks.
- REMOVE_BOOKMARK: Explicit command to remove/delete a bookmark.
- SCALE: Explicit command to change font size, UI scale, or zoom scale (0 to 5).
- JAVASCRIPT: Explicit command to enable or disable JavaScript settings (true/false).
- COOKIES: Explicit command to enable, disable, or toggle cookie settings (true/false).
- PASSWORDS: Explicit command to enable or disable password saving settings (true/false).
- DEVELOPER_SETTINGS: Explicit command to toggle developer mode / Eruda console (true/false).
- VPN: Explicit command to change VPN protection mode (off, default, or family).
- TEXT: ANY general question, factual inquiry, conversation, search query, or topic lookup (e.g., "Which countries have mandatory military service?", "Search for local weather", "Who founded Google?", "What is Java?").

CRITICAL CLASSIFICATION RULES:
1. Default to TEXT for all general queries, questions, information requests, or discussions, EVEN IF they mention search engines, websites, tech terms, or browser features.
2. ONLY select a setting decision (SEARCH_ENGINE, THEME, JAVASCRIPT, etc.) if the user is explicitly ordering an ACTION to modify/change a browser configuration setting.
3. Informational questions like "What is the best search engine?" or "Which countries have conscription?" MUST BE CLASSIFIED AS "TEXT".`;

// Όρια Timeout
const GOOGLE_TIMEOUT_MS = 10000; // 10s για Router & UI Settings
const CHAT_TIMEOUT_MS = 45000; // 45s για Web Search & Video Analysis

const withTimeout = (promise, ms = GOOGLE_TIMEOUT_MS) => {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
	]);
};

// Helper to wrap object property schemas correctly for SDK
const buildSchema = (properties, requiredKeys = []) => ({
	type: Type.OBJECT,
	properties: properties,
	required: requiredKeys
});

app.post('/api/chat', async (req, res) => {
	const {
		prompt, images, mimeType, history, aspectRatio
	} = req.body;

	try {
		// Μετατροπή και εξασφάλιση της δομής "parts" για όλα τα στοιχεία του history
		const safeHistory = Array.isArray(history)
		? history
		.filter(item => item && item.role)
		.map(item => ({
			role: item.role === 'assistant' ? 'model': item.role,
			parts: Array.isArray(item.parts) ? item.parts: [{
				text: item.content || ''
			}]
		})): [];

		// Επεξεργασία τυχόν YouTube link στο prompt μέσω Transcript API
		const videoTranscript = await processYouTubeVideo(prompt);

		let finalPrompt = prompt;
		if (videoTranscript) {
			finalPrompt = `${prompt}\n\n[YouTube Video Transcript]:\n${videoTranscript}`;
		}

		// 1. Router Call
		const routerPromise = ai.models.generateContent({
			model: ROUTER_MODEL,
			contents: [
				...safeHistory,
				{
					role: "user", parts: [{
						text: `Analyze user intent: "${prompt}"`
					}]
				}],
			config: {
				systemInstruction: ROUTER_SYSTEM_INSTRUCTION,
				responseMimeType: "application/json",
				responseSchema: buildSchema( {
					decision: {
						type: Type.STRING, description: "Classification keyword."
					}
				}, ["decision"]),
				temperature: 0.0
			}
		});

		let decision = "TEXT";
		try {
			const routerResponse = await withTimeout(routerPromise, GOOGLE_TIMEOUT_MS);
			const routerJson = JSON.parse(routerResponse.text);
			if (routerJson?.decision) decision = routerJson.decision.trim().toUpperCase();
		} catch (e) {
			decision = "TEXT";
		}

		// Αν βρέθηκε transcript, εξαναγκάζουμε την απόφαση σε TEXT για ανάλυση περιεχομένου
		if (videoTranscript) {
			decision = "TEXT";
		}

		// 2. Image Generation Branch
		if (decision === "IMAGE") {
			const contextChat = ai.chats.create({
				model: ROUTER_MODEL,
				history: safeHistory,
				config: {
					systemInstruction: "Output a single detailed English prompt for image generation based on user input. Output ONLY prompt text."
				}
			});

			const synthRes = await withTimeout(contextChat.sendMessage({
				message: prompt
			}), GOOGLE_TIMEOUT_MS);
			const currentParts = [{
				text: synthRes.text.trim()
			}];

			if (Array.isArray(images)) {
				images.forEach(imgBase64 => {
					currentParts.push({
						inlineData: {
							data: imgBase64, mimeType: mimeType || "image/jpeg"
						}
					});
				});
			}

			const imgRes = await withTimeout(ai.models.generateContent({
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
			}), 15000);

			const parts = imgRes.candidates?.[0]?.content?.parts || [];
			const generatedImages = parts.filter(p => p.inlineData).map(p => ({
				data: p.inlineData.data,
				mimeType: p.inlineData.mimeType
			}));

			return res.json({
				success: true,
				text: "Here is your requested image:",
				images: generatedImages,
				token: imgRes.usageMetadata?.totalTokenCount || 0
			});

			// 3. UI Settings Branch
		} else if (["NAVIGATE", "THEME", "TOOLBAR", "SEARCH_ENGINE", "BOOKMARK", "REMOVE_BOOKMARK", "SCALE", "JAVASCRIPT", "COOKIES", "PASSWORDS", "DEVELOPER_SETTINGS", "VPN"].includes(decision)) {

			let systemPrompt = "";
			let props = {};

			switch (decision) {
				case "NAVIGATE":
					systemPrompt = "Extract destination URL.";
					props = {
						url: {
							type: Type.STRING
						}
					};
					break;
				case "THEME":
					systemPrompt = "Identify theme mode (dark, light, or system).";
					props = {
						theme: {
							type: Type.STRING,
							enum: ["dark",
								"light",
								"system"]
						}
					};
					break;
				case "TOOLBAR":
					systemPrompt = "Identify toolbar placement (top, bottom).";
					props = {
						action: {
							type: Type.STRING,
							enum: ["top",
								"bottom"]
						}
					};
					break;
				case "SEARCH_ENGINE":
					systemPrompt = "Extract search engine name and search URL template using '%s'.";
					props = {
						engine: {
							type: Type.STRING
						},
						searchUrl: {
							type: Type.STRING
						}
					};
					break;
				case "BOOKMARK":
					systemPrompt = "Extract title and URL for bookmark.";
					props = {
						title: {
							type: Type.STRING
						},
						url: {
							type: Type.STRING
						}
					};
					break;
				case "REMOVE_BOOKMARK":
					systemPrompt = "Extract title of bookmark to remove.";
					props = {
						title: {
							type: Type.STRING
						}
					};
					break;
				case "SCALE":
					systemPrompt = "Extract integer scale between 0 and 5.";
					props = {
						scale: {
							type: Type.INTEGER
						}
					};
					break;
				case "JAVASCRIPT":
					systemPrompt = "Extract JavaScript enabled state (boolean).";
					props = {
						javaScript: {
							type: Type.BOOLEAN
						}
					};
					break;
				case "COOKIES":
					systemPrompt = "Extract cookies enabled state (boolean).";
					props = {
						cookies: {
							type: Type.BOOLEAN
						}
					};
					break;
				case "PASSWORDS":
					systemPrompt = "Extract password saving state (boolean).";
					props = {
						passwords: {
							type: Type.BOOLEAN
						}
					};
					break;
				case "DEVELOPER_SETTINGS":
					systemPrompt = "Extract developer mode state (boolean).";
					props = {
						developer: {
							type: Type.BOOLEAN
						}
					};
					break;
				case "VPN":
					systemPrompt = "Extract VPN mode (off, default, family).";
					props = {
						vpn: {
							type: Type.STRING,
							enum: ["off",
								"default",
								"family"]
						}
					};
					break;
			}

			const reqKeys = Object.keys(props);
			const uiRes = await withTimeout(ai.models.generateContent({
				model: CHAT_MODEL,
				contents: `Process request: "${prompt}"`,
				config: {
					systemInstruction: systemPrompt,
					responseMimeType: "application/json",
					responseSchema: buildSchema(props, reqKeys)
				}
			}), GOOGLE_TIMEOUT_MS);

			const parsed = JSON.parse(uiRes.text);

			const uiResponses = {
				NAVIGATE: {
					text: `<div class="thought">Zen Auto-Routing...</div><p>Routing to link: <a href="${parsed.url}" target="_blank">${parsed.url}</a></p>`,
					function: "NAVIGATE",
					data: JSON.stringify({
						openUrl: parsed.url
					})
			},
			THEME: {
				text: `<div class="thought">Zen Settings...</div><p>Theme set to <strong>${parsed.theme} mode</strong>.</p>`,
				function: "THEME",
				data: JSON.stringify({
					setTheme: parsed.theme
				})
			},
			TOOLBAR: {
				text: `<div class="thought">Zen Settings...</div><p>Toolbar set to <strong>${parsed.action}</strong>.</p>`,
				function: "TOOLBAR",
				data: JSON.stringify({
					setToolbarPosition: parsed.action
				})
			},
			SEARCH_ENGINE: {
				text: `<div class="thought">Zen Settings...</div><p>Default engine set to <strong>${parsed.engine}</strong>.</p>`,
				function: "SEARCH_ENGINE",
				data: JSON.stringify({
					setSearchEngine: parsed.engine, searchUrlTemplate: parsed.searchUrl
				})
			},
			BOOKMARK: {
				text: `<div class="thought">Zen Bookmarks...</div><p>Added <strong>${parsed.title}</strong> to Bookmarks.</p>`,
				function: "BOOKMARK",
				data: JSON.stringify({
					title: parsed.title, url: parsed.url
				})
			},
			REMOVE_BOOKMARK: {
				text: `<div class="thought">Zen Bookmarks...</div><p>Removed <strong>${parsed.title}</strong> from Bookmarks.</p>`,
				function: "REMOVE_BOOKMARK",
				data: JSON.stringify({
					removeTitle: parsed.title
				})
			},
			SCALE: {
				text: `<div class="thought">Zen Settings...</div><p>Scale set to <strong>${parsed.scale}</strong>.</p>`,
				function: "SCALE",
				data: JSON.stringify({
					setScale: String(parsed.scale)
				})
			},
			JAVASCRIPT: {
				text: `<div class="thought">Zen Settings...</div><p>JavaScript set to <strong>${parsed.javaScript}</strong>.</p>`,
				function: "JAVASCRIPT",
				data: JSON.stringify({
					setJavaScript: parsed.javaScript
				})
			},
			COOKIES: {
				text: `<div class="thought">Zen Settings...</div><p>Cookies set to <strong>${parsed.cookies}</strong>.</p>`,
				function: "COOKIES",
				data: JSON.stringify({
					setCookies: parsed.cookies
				})
			},
			PASSWORDS: {
				text: `<div class="thought">Zen Settings...</div><p>Password saving set to <strong>${parsed.passwords}</strong>.</p>`,
				function: "PASSWORDS",
				data: JSON.stringify({
					setPassword: parsed.passwords
				})
			},
			DEVELOPER_SETTINGS: {
				text: `<div class="thought">Zen Settings...</div><p>Developer Mode set to <strong>${parsed.developer}</strong>.</p>`,
				function: "DEVELOPER_SETTINGS",
				data: JSON.stringify({
					setDeveloper: parsed.developer
				})
			},
			VPN: {
				text: `<div class="thought">Zen Settings...</div><p>VPN set to <strong>${parsed.vpn}</strong>.</p>`,
				function: "VPN",
				data: JSON.stringify({
					setVPN: parsed.vpn
				})
			}
		};

		return res.json({
			...uiResponses[decision],
			token: uiRes.usageMetadata?.totalTokenCount || 0
		});

		// 4. Standard Chat, Search & Transcript Processing
	} else {
		const chat = ai.chats.create({
			model: CHAT_MODEL,
			history: safeHistory,
			config: {
				systemInstruction: SYSTEM_INSTRUCTION,
				tools: [{
					googleSearch: {}
				}],
				safetySettings: safety,
		},
		});

	const messageParts = [];

	// Προσθήκη εικόνων αν υπάρχουν στο request
	if (Array.isArray(images) && images.length > 0) {
		images.forEach(imgBase64 => {
			messageParts.push({
				inlineData: {
					data: imgBase64,
					mimeType: mimeType || "image/jpeg"
				}
			});
		});
	}

	messageParts.push(finalPrompt);

	const chatPromise = chat.sendMessage({
		message: messageParts
	});

	const response = await withTimeout(chatPromise, CHAT_TIMEOUT_MS);
	return res.json({
		text: response.text,
		token: response.usageMetadata?.totalTokenCount || 0
	});
}

} catch (globalError) {
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
	return res.status(500).json({
		error: "AI services unavailable."
	});
}
}
});

// Quiz Endpoint
app.post('/api/quiz', async (req, res) => {
const {
prompt
} = req.body;
const randomSeed = Math.floor(Math.random() * 100000);

const quizProperties = {
question: {
type: Type.STRING
},
answer1: {
type: Type.STRING
},
answer2: {
type: Type.STRING
},
answer3: {
type: Type.STRING
},
answer4: {
type: Type.STRING
},
answer: {
type: Type.STRING,
enum: ["answer1",
"answer2",
"answer3",
"answer4"]
}
};

try {
const uiPromise = ai.models.generateContent({
model: CHAT_MODEL,
contents: `Topic/Prompt: "${prompt}"`,
config: {
systemInstruction: `Generate a trivia question based on topic. Random seed: ${randomSeed}`,
temperature: 1.0,
responseMimeType: "application/json",
responseSchema: buildSchema(quizProperties, Object.keys(quizProperties))
}
});

const uiResponse = await withTimeout(uiPromise, GOOGLE_TIMEOUT_MS);
const parsed = JSON.parse(uiResponse.text);

return res.json(parsed);
} catch (error) {
return res.status(500).json({
error: "Failed to generate quiz.", details: error.message
});
}
});

app.get('/api/wakeup', (req, res) => res.status(200).json({
status: "online"
}));

// --- TELEGRAM BOT INTEGRATION ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (botToken) {
const bot = new TelegramBot(botToken, {
polling: true
});
console.log('Telegram Bot initialized and listening...');

bot.on('message', async (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!text) return;

bot.sendChatAction(chatId, 'typing');

try {
const videoTranscript = await processYouTubeVideo(text);
let finalPrompt = text;
if (videoTranscript) {
finalPrompt = `${text}\n\n[YouTube Video Transcript]:\n${videoTranscript}`;
}

const chat = ai.chats.create({
model: CHAT_MODEL,
config: {
systemInstruction: "Your name is Zen. Answer concisely and clearly in plain text or Markdown.",
tools: [{
googleSearch: {}
}],
safetySettings: safety
}
});

const chatPromise = chat.sendMessage({
message: finalPrompt
});
const response = await withTimeout(chatPromise, CHAT_TIMEOUT_MS);

let replyText = response.text || "Δεν είχα κάποια απάντηση.";
replyText = replyText.replace(/<div class="thought">[\s\S]*?<\/div>/gi, '');
replyText = replyText.replace(/<[^>]*>?/gm, '');

await bot.sendMessage(chatId, replyText.trim());

} catch (error) {
console.error('Telegram Bot Error:', error.message);

try {
const paxResponse = await paxsenix.createChatCompletion({
model: 'gpt-4o-mini',
messages: [{
role: 'system', content: "Your name is Zen. Answer concisely."
},
{
role: 'user', content: text
}]
});
await bot.sendMessage(chatId, paxResponse.choices[0].message.content);
} catch (paxErr) {
await bot.sendMessage(chatId, "Συγγνώμη, υπήρξε πρόβλημα κατά την επεξεργασία του αιτήματος.");
}
}
});
} else {
console.log('TELEGRAM_BOT_TOKEN is not set. Telegram Bot is disabled.');
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
