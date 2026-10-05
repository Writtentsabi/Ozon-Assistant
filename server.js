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
import {
	Bot
} from 'node-telegram-bot-api';
import {
	run
} from 'node-telegram-bot-api/node';

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

// TELEGRAM BOT (Full Capabilities, Admin Approval & Topic Broadcasts)
import {
InputFile, InlineKeyboard
} from 'node-telegram-bot-api';

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

// Χάρτης με τα ID των Topics του Supergroup (Αντικατάστησε τα IDs με τα δικά σου)
const TOPIC_MAP = {
ANNOUNCEMENTS: 2, // ID του Topic για Ανακοινώσεις
UPDATES: 4, // ID του Topic για Updates/Features
GENERAL: 1 // Default Main Topic
};

// Το Chat ID της ομάδας (Supergroup) στην οποία θα γίνονται οι αναδημοσιεύσεις
const TARGET_GROUP_ID = process.env.TELEGRAM_TARGET_GROUP_ID;

if (telegramToken) {
const bot = new Bot(telegramToken);

// ----------------------------------------------------
// 1. INLINE KEYBOARD CALLBACKS (Approve / Reject)
// ----------------------------------------------------
bot.on('callback_query:data', async (ctx) => {
const data = ctx.callbackQuery.data;

if (data.startsWith('approve_') || data.startsWith('reject_')) {
const [action,
targetAction,
chatId,
userIdStr,
messageIdStr] = data.split('_');
const targetUserId = parseInt(userIdStr);
const targetMessageId = parseInt(messageIdStr);

if (action === 'reject') {
await ctx.editMessageText("❌ Action rejected by admin.");
await ctx.answerCallbackQuery({
text: "Action cancelled."
});
return;
}

if (action === 'approve') {
try {
if (targetAction === 'kick') {
await ctx.api.banChatMember({
chat_id: chatId, user_id: targetUserId
});
await ctx.api.unbanChatMember({
chat_id: chatId, user_id: targetUserId
});
await ctx.editMessageText("✅ User successfully kicked upon approval.");
} else if (targetAction === 'ban') {
await ctx.api.banChatMember({
chat_id: chatId, user_id: targetUserId
});
await ctx.editMessageText("✅ User successfully banned upon approval.");
} else if (targetAction === 'del') {
await ctx.api.deleteMessage({
chat_id: chatId, message_id: targetMessageId
});
await ctx.editMessageText("✅ Message successfully deleted upon approval.");
}
await ctx.answerCallbackQuery({
text: "Action executed!"
});
} catch (err) {
console.error("Error executing approved action:", err);
await ctx.editMessageText("⚠️ Failed to execute action (insufficient permissions).");
}
}
}
});

// ----------------------------------------------------
// 2. CHANNEL POSTS ROUTING (Owner Updates to Topics)
// ----------------------------------------------------
bot.on('channel_post',
async (ctx) => {
const channelPost = ctx.channelPost;
const postText = channelPost?.text || channelPost?.caption || "";

if (!postText || !TARGET_GROUP_ID) return;

try {
// Χρήση του Router για την επιλογή του κατάλληλου Topic
const topicAnalysis = await withTimeout(
ai.models.generateContent({
model: ROUTER_MODEL,
contents: [{
role: "user", parts: [{
text: `Categorize channel update: "${postText}"`
}]
}],
config: {
systemInstruction: `You are a content router for Telegram topics. Categorize the post into one of these keys: "ANNOUNCEMENTS", "UPDATES", or "GENERAL".
Return JSON format: { "topic": "ANNOUNCEMENTS" }`,
responseMimeType: "application/json",
temperature: 0.0
}
}),
3000
);

const result = JSON.parse(topicAnalysis.text);
const selectedTopicKey = result?.topic?.toUpperCase() || "ANNOUNCEMENTS";
const targetThreadId = TOPIC_MAP[selectedTopicKey] || TOPIC_MAP.GENERAL;

// Αναδημοσίευση (Forward) του μηνύματος του ιδιοκτήτη στο σωστό Topic της ομάδας
await ctx.api.forwardMessage({
chat_id: TARGET_GROUP_ID,
from_chat_id: channelPost.chat.id,
message_id: channelPost.message_id,
message_thread_id: targetThreadId
});

console.log(`Forwarded channel post to topic thread ID: ${targetThreadId}`);
} catch (err) {
console.error("Error forwarding channel post to topic:", err);
}
});

// ----------------------------------------------------
// 3. MAIN MESSAGE HANDLER (Group & Direct Messages)
// ----------------------------------------------------
bot.on('message',
async (ctx) => {
const chatId = ctx.chat.id;
const userPrompt = ctx.message?.text || ctx.message?.caption || "";
const photo = ctx.message?.photo;
const messageId = ctx.message?.message_id;
const replyToMessage = ctx.message?.reply_to_message;
const sender = ctx.message?.from;

if (!userPrompt && !photo) return;

try {
// ADMIN COMMANDS
if (userPrompt.startsWith('/pin')) {
if (replyToMessage) {
await ctx.api.pinChatMessage({
chat_id: chatId, message_id: replyToMessage.message_id
});
await ctx.reply("📌 Message pinned successfully.");
} else {
await ctx.reply("⚠️ Please reply to the message you want to pin using /pin.");
}
return;
}

if (userPrompt.startsWith('/unpin')) {
if (replyToMessage) {
await ctx.api.unpinChatMessage({
chat_id: chatId, message_id: replyToMessage.message_id
});
await ctx.reply("📌 Message unpinned.");
} else {
await ctx.api.unpinAllChatMessages({
chat_id: chatId
});
await ctx.reply("📌 All messages unpinned.");
}
return;
}

// AUTO-MODERATION WITH APPROVAL SYSTEM
if (userPrompt.length > 0 && !userPrompt.startsWith('/')) {
try {
const modCheck = await withTimeout(
ai.models.generateContent({
model: ROUTER_MODEL,
contents: [{
role: "user", parts: [{
text: `Analyze message for moderation: "${userPrompt}"`
}]
}],
config: {
systemInstruction: `You are an automated group moderator. Analyze the message for rule violations (spam, severe toxicity, unauthorized ads, explicit hate speech).
Return JSON with format:
{
"violation": true/false,
"reason": "short explanation",
"recommendedAction": "DELETE" or "KICK" or "BAN" or "NONE"
}`,
responseMimeType: "application/json",
temperature: 0.0
}
}),
3000
);

const modResult = JSON.parse(modCheck.text);

if (modResult?.violation && modResult.recommendedAction !== "NONE") {
const actionMap = {
"DELETE": "del",
"KICK": "kick",
"BAN": "ban"
};
const actionCode = actionMap[modResult.recommendedAction] || "del";

const keyboard = new InlineKeyboard()
.text("✅ Approve", `approve_${actionCode}_${chatId}_${sender.id}_${messageId}`)
.text("❌ Reject", `reject_${actionCode}_${chatId}_${sender.id}_${messageId}`);

await ctx.reply(
`🛡️ **Moderation Flag**\n\n` +
`• **User:** ${sender.first_name} (@${sender.username || 'N/A'})\n` +
`• **Reason:** ${modResult.reason}\n` +
`• **Suggested Action:** ${modResult.recommendedAction}\n\n` +
`*Admin approval required to execute:*`,
{
reply_markup: keyboard, parse_mode: "Markdown"
}
);
return;
}
} catch (modErr) {
console.error("Moderation check failed:", modErr);
}
}

// STANDARD ZEN AI & ROUTING LOGIC
await ctx.api.sendChatAction({
chat_id: chatId, action: 'typing'
});

let imagesPayload = [];
let mimeType = "image/jpeg";

if (photo && photo.length > 0) {
const highestResPhoto = photo[photo.length - 1];
const fileInfo = await ctx.api.getFile({
file_id: highestResPhoto.file_id
});
const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${fileInfo.file_path}`;

const responseImg = await fetch(fileUrl);
const arrayBuffer = await responseImg.arrayBuffer();
const base64Img = Buffer.from(arrayBuffer).toString('base64');
imagesPayload.push(base64Img);
}

const videoTranscript = await processYouTubeVideo(userPrompt);
let finalPrompt = userPrompt;
if (videoTranscript) {
finalPrompt = `${userPrompt}\n\n[YouTube Video Transcript]:\n${videoTranscript}`;
}

let decision = "TEXT";
if (imagesPayload.length === 0 && !videoTranscript) {
try {
const routerResponse = await withTimeout(
ai.models.generateContent({
model: ROUTER_MODEL,
contents: [{
role: "user", parts: [{
text: `Analyze user intent: "${userPrompt}"`
}]
}],
config: {
systemInstruction: ROUTER_SYSTEM_INSTRUCTION,
responseMimeType: "application/json",
responseSchema: buildSchema( {
decision: {
type: Type.STRING
}
}, ["decision"]),
temperature: 0.0
}
}),
GOOGLE_TIMEOUT_MS
);
const routerJson = JSON.parse(routerResponse.text);
if (routerJson?.decision) decision = routerJson.decision.trim().toUpperCase();
} catch (e) {
decision = "TEXT";
}
}

if (decision === "IMAGE") {
await ctx.api.sendChatAction({
chat_id: chatId, action: 'upload_photo'
});

const imgRes = await withTimeout(
ai.models.generateContent({
model: IMAGE_MODEL,
contents: [{
role: "user",
parts: [{
text: userPrompt
},
...imagesPayload.map(img => ({
inlineData: {
data: img, mimeType
}
}))
]
}],
config: {
responseModalities: ['IMAGE'],
safetySettings: safety,
imageConfig: {
aspectRatio: "1:1"
}
}
}),
15000
);

const parts = imgRes.candidates?.[0]?.content?.parts || [];
const generatedImage = parts.find(p => p.inlineData);

if (generatedImage) {
const imgBuffer = Buffer.from(generatedImage.inlineData.data, 'base64');
await ctx.api.sendPhoto({
chat_id: chatId,
photo: new InputFile(imgBuffer, {
filename: "generated.jpg"
}),
caption: "🎨 Here is your generated image by Zen!"
});
return;
}
}

const chat = ai.chats.create({
model: CHAT_MODEL,
config: {
systemInstruction: `Your name is Zen, you are the personal assistant for OxyZen and community manager.
CORE RULES:
1. Maintain your helpful, smart, and concise persona as Zen.
2. Provide direct, clean responses in standard text or simple Markdown.
3. Do NOT use HTML tags (like <div>, <p>, <span>) or raw code blocks in responses.`,
tools: [{
googleSearch: {}
}],
safetySettings: safety,
},
});

const messageParts = [];
if (imagesPayload.length > 0) {
imagesPayload.forEach(imgBase64 => {
messageParts.push({
inlineData: {
data: imgBase64, mimeType
}
});
});
}
messageParts.push(finalPrompt || "Describe this image.");

const response = await withTimeout(chat.sendMessage({
message: messageParts
}), CHAT_TIMEOUT_MS);

let cleanResponse = response.text
.replace(/<div class="thought">[\s\S]*?<\/div>/gi, '')
.replace(/<\/?[^>]+(>|$)/g, '')
.trim();

if (!cleanResponse) cleanResponse = response.text;

await ctx.reply(cleanResponse);

} catch (error) {
console.error("Telegram Bot Error:", error);
await ctx.reply("⚠️ An error occurred while processing your request.");
}
});

bot.catch((err) => console.error("Telegram error:", err));

run(bot);
console.log("Telegram Bot initialized with Channel Broadcasts & Topics routing.");
} else {
console.log("TELEGRAM_BOT_TOKEN is missing in environment variables.");
}

// GITHUB WEBHOOK HANDLER (Broadcast to Telegram Topics)
app.post('/api/github-webhook', async (req, res) => {
const event = req.headers['x-github-event'];
const payload = req.body;

if (!payload || !process.env.TELEGRAM_TARGET_GROUP_ID) {
return res.status(400).send('Missing payload or Telegram configuration.');
}

try {
let messageText = "";
let category = "UPDATES";

// 1. Νέο Release (π.χ. OxyZen Browser v2.0)
if (event === 'release' && payload.action === 'published') {
category = "ANNOUNCEMENTS";
messageText = `🚀 **New Release Published!**\n\n` +
`• **Version:** ${payload.release.tag_name}\n` +
`• **Name:** ${payload.release.name || 'N/A'}\n` +
`• **Repository:** ${payload.repository.name}\n\n` +
`${payload.release.body || ''}\n\n` +
`🔗 [View Release](${payload.release.html_url})`;
}
// 2. Νέο Commit στο main/master branch
else if (event === 'push') {
category = "UPDATES";
const commits = payload.commits || [];
if (commits.length === 0) return res.status(200).send('No commits found.');

const commitMessages = commits.map(c => `• ${c.message} (by _${c.author.name}_)`).join('\n');
messageText = `🔨 **New Commit(s) Pushed!**\n\n` +
`• **Repository:** ${payload.repository.name}\n` +
`• **Branch:** ${payload.ref.replace('refs/heads/', '')}\n\n` +
`${commitMessages}\n\n` +
`🔗 [Compare Changes](${payload.compare})`;
}
// 3. Νέο Issue ή Pull Request
else if (event === 'issues' && payload.action === 'opened') {
category = "GENERAL";
messageText = `🐛 **New Issue Opened**\n\n` +
`• **Title:** ${payload.issue.title}\n` +
`• **Author:** @${payload.issue.user.login}\n\n` +
`🔗 [View Issue](${payload.issue.html_url})`;
}

if (messageText) {
const targetThreadId = TOPIC_MAP[category] || TOPIC_MAP.GENERAL;

// Αποστολή του μηνύματος στο συγκεκριμένο Topic της ομάδας
await bot.api.sendMessage(
process.env.TELEGRAM_TARGET_GROUP_ID,
messageText,
{
message_thread_id: targetThreadId,
parse_mode: 'Markdown',
disable_web_page_preview: true
}
);
}

return res.status(200).send('Webhook processed successfully.');
} catch (error) {
console.error('Error handling GitHub webhook:', error);
return res.status(500).send('Internal Server Error');
}
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
