// server.js (Πλήρης και Διορθωμένη Έκδοση)
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

// Ρυθμίσεις Ασφαλείας (Safety Settings) όπως ορίστηκαν από τον χρήστη
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


app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = `Your name is Zen, the multimodal personal assistant for the OxyZen Browser (the lightweight, Material Design rebuild of the Ozon Browser). 

CORE IDENTITY: You are calm, efficient, and user-centric. You assist with web navigation, browser management, and sophisticated image generation/editing.

INPUT CAPABILITIES: 
- You process text and images as equal-class inputs.
- You can analyze multiple images simultaneously (OxyZen v1.10 feature).
- You understand detailed visual context, including lighting, composition, and style.

REQUIRED OUTPUT STRUCTURE:
Every response MUST follow this exact two-part format:

1. INTERNAL MONOLOGUE:
- Start with <div class="thought">.
- Analyze User Intent: Is the request for navigation, information, or image creation?
- Visual Analysis: If images are provided, describe their core components (Subject, Lighting, Style).
- Planning: If generating an image, construct a narrative prompt using the 6-component framework (Shot, Subject, Action, Environment, Lighting, Style).
- Persona Check: Ensure the planned response matches the "Zen" tone.
- Close with </div>.

2. FINAL RESPONSE:
- Immediately follow the thought block with the final user-facing message.
- Use only these HTML tags: <p>, <ul>, <li>, <strong>, <a>.
- DO NOT use <html>, <head>, or <body> tags.
- DO NOT use markdown code blocks (\` \` \`) for the HTML output.
- Tone: Maintain a calm, professional, and efficient personality. Focus on helping the user navigate the modern, fast OxyZen experience.

IMAGE GENERATION RULES:
- Describe scenes narratively; do not list keywords.
- For "OxyZen" themed requests, prioritize minimalist Material Design 3 aesthetics.
- Use professional photography terminology (e.g., 85mm lens, golden hour, bokeh) to guide visual rendering.
- Maintain character and style consistency across iterative edits by referencing specific technical descriptors.`;

// 1. Endpoint για Συνομιλία (Text-Only Chat)
app.post('/api/chat', async (req, res) => {
  const { prompt, history } = req.body;
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: history || [],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }], 
      safetySettings: safety,
    },
  });

  try {
    const response = await chat.sendMessage({ message: prompt });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: "Σφάλμα κατά την κλήση του Gemini Chat." });
  }
});

// 2. Endpoint για Πολυτροπική Συνομιλία (Input: Images -> Output: Text)
app.post('/api/multimodal-chat', async (req, res) => {
  const { prompt, images, mimeType, history } = req.body;
  if (!images ||!Array.isArray(images) ||!prompt) {
    return res.status(400).json({ error: "Missing images array or prompt." });
  }

  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: history || [],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }], 
      safetySettings: safety,
    },
  });

  try {
    const imageParts = images.map(imgBase64 => ({
      inlineData: { 
        data: imgBase64, 
        mimeType: mimeType || "image/jpeg" 
      }
    }));
    const response = await chat.sendMessage({ message: [...imageParts, prompt] });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Multimodal Error:", error);
    res.status(500).json({ error: "Server error." });
  }
});

// 3. Endpoint για Παραγωγή Εικόνας (Image Generation)
app.post('/api/generate-image', async (req, res) => {
  const { prompt, images, mimeType, aspectRatio, history } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Το prompt είναι υποχρεωτικό." });
  }

  try {
    const contents = [{ text: prompt }];

    if (images && Array.isArray(images)) {
      images.forEach(imgBase64 => {
        contents.push({
          inlineData: {
            data: imgBase64,
            mimeType: mimeType || "image/jpeg"
          }
        });
      });
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      history: history || [],
      contents: contents,
      config: { 
        safetySettings: safety,
        imageConfig: {
          aspectRatio: aspectRatio || "1:1",
          personGeneration: "ALLOW"
        }
      }
    });

    // ΔΙΟΡΘΩΣΗ ΣΦΑΛΜΑΤΟΣ: Αφαίρεση του ?. πριν το ; και ενοποίηση των ||
    const candidate = response.candidates ? response.candidates[0] : null;
    const parts = candidate?.content?.parts;

    if (!parts || parts.length === 0) {
        const reason = candidate?.finishReason || "UNKNOWN";
        const safetyFeedback = response.promptFeedback?.blockReason || "";
        return res.status(500).json({ 
            error: `Το μοντέλο δεν επέστρεψε εικόνα. Αιτία: ${reason}. ${safetyFeedback}` 
        });
    }

    const generatedImages = parts
    .filter(part => part.inlineData)
    .map(part => ({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      }));

    if (generatedImages.length === 0) {
        res.json({ success: true, text: response.text });
    } else {
        res.json({ success: true, images: generatedImages, text: response.text });
    }

    res.json({ success: true, images: generatedImages, text: response.text });

  } catch (error) {
    console.error("Image Generation Error:", error);
    res.status(500).json({ error: "Σφάλμα κατά την παραγωγή: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
