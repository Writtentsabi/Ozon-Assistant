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
const safety =[
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

// Ορισμός εργαλείων για το Function Calling [span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)[span_2](start_span)[span_2](end_span)
const tools =
        }
      },
      {
        name: "generate_image",
        description: "Χρησιμοποιήστε το όταν ο χρήστης ζητά ρητά να δημιουργήσετε μια νέα εικόνα (π.χ. 'φτιάξε', 'δείξε μου').",
        parametersJsonSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Η περιγραφή της εικόνας στα Αγγλικά." },
            aspectRatio: { type: "string", enum: ["1:1", "4:3", "3:4", "16:9", "9:16"], default: "1:1" }
          },
          required: ["prompt"]
        }
      }
    ]
  }
];

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// Βασική λογική παραγωγής εικόνας [span_3](start_span)[span_3](end_span)[span_4](start_span)[span_4](end_span)
async function handleImageGen(prompt, images, aspectRatio) {
  const contents = [{ text: prompt }];
  if (images && Array.isArray(images)) {
    images.forEach(imgBase64 => {
      contents.push({
        inlineData: { data: imgBase64, mimeType: "image/jpeg" }
      });
    });
  }

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: contents,
    config: { 
      systemInstruction: SYSTEM_INSTRUCTION,
      safetySettings: safety,
      imageConfig: {
        aspectRatio: aspectRatio || "1:1",
        personGeneration: "ALLOW"
      }
    }
  });

  const parts = response.candidates?.?.content?.parts ||;
  const generatedImages = parts
   .filter(part => part.inlineData)
   .map(part => ({ data: part.inlineData.data, mimeType: part.inlineData.mimeType }));

  return { success: true, images: generatedImages, text: response.text };
}

// Κεντρικό Endpoint Ενορχήστρωσης [span_5](start_span)[span_5](end_span)[span_6](start_span)[span_6](end_span)[span_7](start_span)[span_7](end_span)
app.post('/api/zen-orchestrator', async (req, res) => {
  const { prompt, images, history } = req.body;
  
  try {
    const chat = ai.chats.create({
      model: CHAT_MODEL,
      history: history || [],
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION, 
        tools: tools, 
        safetySettings: safety 
      }
    });

    // Κατασκευή του μηνύματος (πολυτροπικό αν υπάρχουν εικόνες) [span_8](start_span)[span_8](end_span)[span_9](start_span)[span_9](end_span)
    let messageContent;
    if (images && Array.isArray(images) && images.length > 0) {
      messageContent =;
    } else {
      messageContent = prompt;
    }

    const result = await chat.sendMessage(messageContent);
    const call = result.response.functionCalls? result.response.functionCalls : null;

    if (!call) {
      return res.json({ text: result.response.text });
    }

    console.log(`Zen Orchestrator: Triggering tool ${call.name}`);

    // Εκτέλεση του εργαλείου
    if (call.name === "generate_image") {
      const imgResult = await handleImageGen(call.args.prompt, images, call.args.aspectRatio);
      return res.json(imgResult);
    } 

    // Για άλλα εργαλεία, στέλνουμε το functionResponse πίσω στο μοντέλο [span_10](start_span)[span_10](end_span)[span_11](start_span)[span_11](end_span)
    const toolResponse = { status: "processed", tool: call.name };
    const finalResult = await chat.sendMessage();

    res.json({ text: finalResult.response.text });

  } catch (error) {
    console.error("Orchestrator Error:", error);
    res.status(500).json({ error: "Internal Server Error: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Zen Server running on port ${PORT}`);
});
