import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const app = express();
const PORT = process.env.PORT || 3000;
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Ρυθμίσεις Ασφαλείας
const safety = [
  {
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

const SYSTEM_INSTRUCTION = `Your name is Zen, the multimodal personal assistant for the OxyZen Browser.
CORE IDENTITY: You are calm, efficient, and user-centric. You specialize in web navigation and high-fidelity image generation/editing.
REQUIRED OUTPUT STRUCTURE:
1. INTERNAL MONOLOGUE: <div class="thought">...</div> (Language Detection, Intent, Modality Commitment, Visual Planning).
2. FINAL RESPONSE: Same language as user. Use only <p>, <ul>, <li>, <strong>, <a> tags.
IMAGE GENERATION RULES: Use narrative descriptions. Material Design 3 aesthetics.`;

// Ορισμός εργαλείων για το Function Calling
const tools = [
  {
    functionDeclarations: [
      {
        name: "generate_image",
        description: "Χρησιμοποιήστε το όταν ο χρήστης ζητά ρητά να δημιουργήσετε μια νέα εικόνα (π.χ. 'φτιάξε', 'δείξε μου').",
        parameters: {
          type: "OBJECT",
          properties: {
            prompt: { type: "STRING", description: "Η περιγραφή της εικόνας στα Αγγλικά." },
            aspectRatio: { type: "STRING", enum: ["1:1", "4:3", "3:4", "16:9", "9:16"], default: "1:1" }
          },
          required: ["prompt"]
        }
      }
    ]
  }
];

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// Βασική λογική παραγωγής εικόνας
async function handleImageGen(prompt, images, aspectRatio) {
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  
  if (images && Array.isArray(images)) {
    images.forEach(imgBase64 => {
      contents[0].parts.push({
        inlineData: { data: imgBase64, mimeType: "image/jpeg" }
      });
    });
  }

  const model = ai.getGenerativeModel({ model: IMAGE_MODEL });
  const result = await model.generateContent({
    contents: contents,
    generationConfig: { 
      systemInstruction: SYSTEM_INSTRUCTION,
      safetySettings: safety,
      // Σημείωση: Το imageConfig εξαρτάται από το συγκεκριμένο API version
      imageConfig: {
        aspectRatio: aspectRatio || "1:1",
        personGeneration: "ALLOW"
      }
    }
  });

  const response = await result.response;
  const parts = response.candidates?.[0]?.content?.parts || [];
  const generatedImages = parts
   .filter(part => part.inlineData)
   .map(part => ({ data: part.inlineData.data, mimeType: part.inlineData.mimeType }));

  return { success: true, images: generatedImages, text: response.text() };
}

// Κεντρικό Endpoint Ενορχήστρωσης
app.post('/api/zen-orchestrator', async (req, res) => {
  const { prompt, images, history } = req.body;
  
  try {
    const model = ai.getGenerativeModel({ 
        model: CHAT_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION
    });

    const chat = model.startChat({
      history: history || [],
      tools: tools, 
      safetySettings: safety 
    });

    // Κατασκευή του μηνύματος (πολυτροπικό αν υπάρχουν εικόνες)
    let messageContent = [];
    messageContent.push({ text: prompt });

    if (images && Array.isArray(images) && images.length > 0) {
      images.forEach(img => {
          messageContent.push({ inlineData: { data: img, mimeType: "image/jpeg" } });
      });
    }

    const result = await chat.sendMessage(messageContent);
    const response = await result.response;
    const calls = response.functionCalls();

    if (!calls || calls.length === 0) {
      return res.json({ text: response.text() });
    }

    const call = calls[0];
    console.log(`Zen Orchestrator: Triggering tool ${call.name}`);

    // Εκτέλεση του εργαλείου
    if (call.name === "generate_image") {
      const imgResult = await handleImageGen(call.args.prompt, images, call.args.aspectRatio);
      return res.json(imgResult);
    } 

    // Για άλλα εργαλεία
    const toolResponse = {
      functionResponse: {
        name: call.name,
        response: { status: "processed", tool: call.name }
      }
    };
    
    const finalResult = await chat.sendMessage([toolResponse]);
    res.json({ text: finalResult.response.text() });

  } catch (error) {
    console.error("Orchestrator Error:", error);
    res.status(500).json({ error: "Internal Server Error: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Zen Server running on port ${PORT}`);
});
