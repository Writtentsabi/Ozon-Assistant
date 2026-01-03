// server.js (Πλήρης και Διορθωμένη Έκδοση)
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

const ai = new GoogleGenAI( {
	apiKey: process.env.GEMINI_API_KEY
});

const paxsenix = new PaxSenixAI(process.env.PAXSENIX_KEY);

// Ρυθμίσεις Ασφαλείας (Safety Settings) όπως ορίστηκαν από τον χρήστη
const safety = [{
	category: "HARM_CATEGORY_HARASSMENT",
	threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_HATE_SPEECH",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		threshold: "BLOCK_NONE",
	},
	{
		category: "HARM_CATEGORY_DANGEROUS_CONTENT",
		threshold: "BLOCK_NONE",
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
- In this section, analyze the user's intent, the context of the conversation, and your plan for the response.
- Reflect on potential nuances, tone requirements, or specific information needed from the user's prompt.
- This is your private reasoning space. Keep it analytical and objective.
- Close this section with </div>.

2. FINAL RESPONSE:
- Immediately after the thought block, provide your actual response to the user.
- Use structured HTML tags (e.g., <p>, <ul>, <strong>, <a>).
- Maintain a helpful, Zen-like, and professional personality.
- IMPORTANT: Do not include <html>, <head>, or <body> tags.
- Ensure the tone matches the "OxyZen Browser" brand: calm, efficient, and user-centric.`;

const IMAGE_SYSTEM_INSTRUCTION = `You are the image generation engine for OxyZen Browser. 

CRITICAL RULES:
1. LANGUAGE: If the user's prompt is not in English, translate the core visual description into English before processing.
2. TRIGGER: Generate an image ONLY if the user explicitly asks for one (e.g., "φτιάξε μια εικόνα", "generate an image", "σχεδίασε", "create a photo", "draw").
3. REFUSAL: If the user is just chatting or asking a question without a request to create a visual, DO NOT generate an image. Instead, provide a brief text response in the user's language explaining that you are ready to create an image when they provide a description.
4. TRANSLATION: Your internal processing for the image generation tool must always be in English to ensure quality.`;

//a. Η μεθοδος με την οποια ο Zen αποφασιζει αν θα απαντησει με εικονα η κειμενο
async function getRouteIntent(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite",
            systemInstruction: "Analyze user intent. If the user explicitly wants to generate, draw, or edit an image, reply ONLY with the word 'IMAGE'. For any other request, question, or chat, reply ONLY with 'TEXT'."
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().toUpperCase();
        
        // Επιστρέφει "IMAGE" μόνο αν είναι απόλυτα σίγουρο, αλλιώς "TEXT"
        return responseText.includes("IMAGE")? "IMAGE" : "TEXT";
    } catch (error) {
        console.error("Routing Error:", error);
        return "TEXT"; // Fallback σε κείμενο για ασφάλεια
    }
}

//b.Η μεθοδος με την οποια απαντα με κειμενο
async function chatWithLogic(prompt, history, images, mimeType) {
    const model = genAI.getGenerativeModel({ 
        model: CHAT_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION, // Ο Zen με το monologue
        tools: 
    });

    const chat = model.startChat({ history: history |

| });
    
    let parts = [{ text: prompt }];
    if (images && images.length > 0) {
        const imageParts = images.map(data => ({
            inlineData: { data, mimeType: mimeType |

| "image/jpeg" }
        }));
        parts = [...imageParts,...parts];
    }

    const result = await chat.sendMessage(parts);
    return {
        text: result.response.text(),
        candidates: result.response.candidates,
        usage: result.response.usageMetadata
    };
}

//c.Η μεθοδος με την οποια απαντα με εικονα
async function generateImageLogic(prompt, images, mimeType) {
    const model = genAI.getGenerativeModel({ 
        model: IMAGE_MODEL,
        systemInstruction: IMAGE_SYSTEM_INSTRUCTION 
    });

    let contents = [{ role: "user", parts: [{ text: prompt }] }];
    if (images && images.length > 0) {
        images.forEach(data => {
            contents.parts.push({ inlineData: { data, mimeType: mimeType |

| "image/jpeg" } });
        });
    }

    const result = await model.generateContent({
        contents,
        generationConfig: { responseModalities: ["IMAGE"] }
    });

    // Φιλτράρισμα για την εξαγωγή των εικόνων Base64
    const generatedImages = result.response.candidates.content.parts
       .filter(part => part.inlineData)
       .map(part => ({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType
        }));

    return { images: generatedImages, usage: result.response.usageMetadata };
}

//1.Το endpoint με το οποιο αλληλεπιδρα ο Zen
app.post('/api/zen-assistant', async (req, res) => {
    const { prompt, history, images, mimeType } = req.body;

    try {
        // 1. Ρωτάμε το Lite μοντέλο τι θέλει ο χρήστης (IMAGE ή TEXT)
        const intent = await getRouteIntent(prompt); 
        console.log("Zen Decision:", intent);

        if (intent === "IMAGE") {
            // Καλεί τη λογική της παλιάς σας μεθόδου /api/generate-image
            // (Χρησιμοποιεί το gemini-2.5-flash-image)
            const result = await generateImageLogic(prompt, images, mimeType);
            res.json(result);
        } else {
            // Καλεί τη λογική της παλιάς σας μεθόδου /api/chat
            // (Χρησιμοποιεί το gemini-2.5-flash με Google Search)
            const result = await chatWithLogic(prompt, history, images, mimeType);
            res.json(result);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//2. Endpoint για δωρεαν παραγωγη chat
app.post('/api/paxsenix-chat', async (req, res) => {
	const {
                prompt, history
        } = req.body;

	try {
		const response = await paxsenix.createChatCompletion({
			model: 'gpt-3.5-turbo',
			messages:[
				{ role: 'system', content: SYSTEM_INSTRUCTION },
				{ role: 'user', content: prompt }
			]
		});

		res.json({
			text: response.text
		});

	} catch (error) {
		res.status(error.status).json({
			Status: error.status,
			Error: error.mesage,
			Data: error.data
		});

	}

});

//3.Το endpoint με το οποιο εμφανιζει ολα τα διαθεσιμα μοντελα paxsenix
app.post('/api/paxsenix-list', async (req, res) => {
   	try {
     		// Example 1: List available models
     		console.log('Listing available models...'); 
     		const models = await paxsenix.listModels(); 
     		res.json({
			text:`Available models: ${models.data.map(model => model.id).join(', ')}`
		});
     		console.log('-------------------');
	} catch (error) {
		res.status(error).json({
			error: "No response on getting models:" + error
		});
	}
});

//4. Υπο κατασκευη
app.post('/api/perchance', async (req, res) => {
	const {
		prompt,history
	} = req.body;
	const count = 5;

	try {
        	const response = await fetch(`https://perchance.org/api/generateList.php?generator=${prompt}&count=${count}`);

        	if (!response.ok) {
          		res.status(response.status).json({
				error:response.status
			});
        	}

        	const data = await response.json();

        	if (data && data.length > 0) {
			res.json({
				text: data
			});
        	} else {
			res.status(500).json({
				error: "No response available"
			});
        	}
	} catch (error) {
        	res.status(error).json({
			error: "Error fetching from Perchance:" + error
		});
    	}
});

//5. Endpoint για διατήρηση του server σε εγρήγορση (Keep-alive)
app.get('/api/wake', (req, res) => {
    res.status(200).json({ 
        status: "online", 
        message: "Zen is awake and ready.",
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
