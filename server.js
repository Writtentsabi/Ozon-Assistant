import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const app = express();
const PORT = process.env.PORT |

| 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL |

| "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL |

| "gemini-2.5-flash-image";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Ρυθμίσεις Ασφαλείας
const safety =;

const SYSTEM_INSTRUCTION = `Your name is Zen, the multimodal personal assistant for the OxyZen Browser.
CORE IDENTITY: You are calm, efficient, and user-centric. You specialize in web navigation and high-fidelity image generation/editing.
REQUIRED OUTPUT STRUCTURE:
1. INTERNAL MONOLOGUE: <div class="thought">...</div> (Language Detection, Intent, Modality Commitment, Visual Planning).
2. FINAL RESPONSE: Same language as user. Use only <p>, <ul>, <li>, <strong>, <a> tags.
IMAGE GENERATION RULES: Use narrative descriptions. Material Design 3 aesthetics.`;

// --- Εργαλεία για το Function Calling --- [span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)
const tools =
        }
      },
      {
        name: "generate_image",
        description: "Χρησιμοποιήστε το όταν ο χρήστης ζητά να δημιουργήσετε μια νέα εικόνα (φτιάξε, δείξε, δημιούργησε).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Η περιγραφή της εικόνας στα Αγγλικά." },
            aspectRatio: { type: "string", enum: ["1:1", "4:3", "3:4", "16:9", "9:16"], default: "1:1" }
          },
          required: ["prompt"]
        }
      },
      {
        name: "multimodal_analysis",
        description: "Χρησιμοποιήστε το όταν ο χρήστης παρέχει εικόνες και ζητά ανάλυση ή περιγραφή τους.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Η ερώτηση σχετικά με την εικόνα." }
          },
          required: ["prompt"]
        }
      }
    ]
  }
];

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// --- Core Logic Functions --- [span_2](start_span)[span_2](end_span)

async function handleChat(prompt, history) {
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: history ||,
    config: { systemInstruction: SYSTEM_INSTRUCTION, tools:, safetySettings: safety }
  });
  const response = await chat.sendMessage({ message: prompt });
  return { text: response.text() };
}

async function handleImageGen(prompt, images, aspectRatio, history) {
  const contents = [{ text: prompt }];
  if (images?.length > 0) {
    images.forEach(img => contents.push({ inlineData: { data: img, mimeType: "image/jpeg" } }));
  }

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: contents,
    config: { 
      systemInstruction: SYSTEM_INSTRUCTION,
      safetySettings: safety,
      imageConfig: { aspectRatio: aspectRatio |

| "1:1", personGeneration: "ALLOW" }
    }
  });

  const candidate = response.candidates? response.candidates : null;
  const parts = candidate?.content?.parts ||;
  const generatedImages = parts
   .filter(part => part.inlineData)
   .map(part => ({ data: part.inlineData.data, mimeType: part.inlineData.mimeType }));

  return { success: true, images: generatedImages, text: response.text() };
}

// --- Endpoints ---

// 1. Zen Orchestrator (Το κεντρικό Call) [span_3](start_span)[span_3](end_span)[span_4](start_span)[span_4](end_span)[span_5](start_span)[span_5](end_span)
app.post('/api/zen-orchestrator', async (req, res) => {
  const { prompt, images, history } = req.body;
  
  try {
    const chat = ai.chats.create({
      model: CHAT_MODEL,
      history: history ||,
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION, 
        tools: tools, 
        safetySettings: safety 
      }
    });

    // Αν υπάρχουν εικόνες στην είσοδο, τις στέλνουμε μαζί με το prompt
    const messageContent = images?.length > 0 
     ?
      : prompt;

    const result = await chat.sendMessage(messageContent);
    const response = result.response;
    const call = response.functionCalls? response.functionCalls : null;

    if (!call) {
      return res.json({ text: response.text() });
    }

    // Διακλάδωση ανάλογα με το Tool που επέλεξε το Gemini
    console.log(`Zen decided to use: ${call.name}`);

    if (call.name === "generate_image") {
      const imgResult = await handleImageGen(call.args.prompt, images, call.args.aspectRatio, history);
      return res.json(imgResult);
    } 
    
    if (call.name === "chat_only" |

| call.name === "multimodal_analysis") {
      // Στέλνουμε ένα εικονικό response πίσω στο μοντέλο για να ολοκληρώσει τη σκέψη του
      const finalResult = await chat.sendMessage();
      return res.json({ text: finalResult.response.text() });
    }

  } catch (error) {
    console.error("Orchestrator Error:", error);
    res.status(500).json({ error: "Σφάλμα ενορχήστρωσης: " + error.message });
  }
});

// 2. Legacy Endpoints (Διατηρούνται για συμβατότητα)
app.post('/api/chat', async (req, res) => {
  try { res.json(await handleChat(req.body.prompt, req.body.history)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate-image', async (req, res) => {
  try { res.json(await handleImageGen(req.body.prompt, req.body.images, req.body.aspectRatio)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Zen Server running on port ${PORT}`);
});


