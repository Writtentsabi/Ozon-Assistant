// server.js (Εμπλουτισμένο με δυνατότητα παραγωγής εικόνων)
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

const safety =;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const SYSTEM_INSTRUCTION = `Your name is Zen, you are the personal assistant for the OxyZen Browser... (τα υπόλοιπα rules παραμένουν ως έχουν)`;

// 1. Endpoint για Συνομιλία (Text-Only)
app.post('/api/chat', async (req, res) => {
  const prompt = req.body.prompt;
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: req.body.history ||,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools:,
      safetySettings: safety,
    },
  });

  try {
    const response = await chat.sendMessage({ message: prompt });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: "Server error." });
  }
});

// 2. Endpoint για Πολυτροπική Συνομιλία (Input: Images -> Output: Text)
app.post('/api/multimodal-chat', async (req, res) => {
  const { prompt, images, mimeType, history } = req.body;
  if (!images ||!Array.isArray(images) ||!prompt) {
    return res.status(400).json({ error: "Missing prompt or images array." });
  }

  const chat = ai.chats.create({
    model: CHAT_MODEL,
    history: history ||,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools:,
      safetySettings: safety,
    },
  });

  try {
    const imageParts = images.map(imgBase64 => ({
      inlineData: { data: imgBase64, mimeType: mimeType |

| "image/jpeg" }
    }));
    const response = await chat.sendMessage({ message: [...imageParts, prompt] });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Multimodal Error:", error);
    res.status(500).json({ error: "Server error." });
  }
});

// 3. ΝΕΟ: Endpoint για Παραγωγή/Επεξεργασία Εικόνας (Input: Prompt/Images -> Output: Image)
app.post('/api/generate-image', async (req, res) => {
  const { prompt, images, mimeType, aspectRatio } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Το prompt είναι υποχρεωτικό." });
  }

  try {
    // Κατασκευή των μερών του αιτήματος
    const contents = [{ text: prompt }];

    // Αν υπάρχουν εικόνες εισόδου (base64), τις προσθέτουμε για Image-to-Image ή Editing [span_6](start_span)[span_6](end_span)[span_7](start_span)[span_7](end_span)
    if (images && Array.isArray(images)) {
      images.forEach(imgBase64 => {
        contents.push({
          inlineData: {
            data: imgBase64,
            mimeType: mimeType |

| "image/jpeg"
          }
        });
      });
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: contents,
      config: {
        // Η ρύθμιση IMAGE ενεργοποιεί την οπτική έξοδο 
        responseModalities: ['IMAGE'], 
        safetySettings: safety,
        imageConfig: {
          aspectRatio: aspectRatio |

| "1:1", // Υποστηρίζονται 16:9, 9:16, κ.α. 
          personGeneration: "ALLOW"
        }
      }
    });

    // Εξαγωγή των παραχθέντων εικόνων από την απόκριση [span_8](start_span)[span_8](end_span)[span_9](start_span)[span_9](end_span)[span_10](start_span)[span_10](end_span)
    const generatedImages = response.candidates.content.parts
     .filter(part => part.inlineData)
     .map(part => ({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      }));

    if (generatedImages.length === 0) {
      return res.status(500).json({ error: "Το μοντέλο δεν επέστρεψε εικόνα. Ελέγξτε τους περιορισμούς ασφαλείας." });
    }

    res.json({ success: true, images: generatedImages });

  } catch (error) {
    console.error("Image Generation Error:", error);
    res.status(500).json({ error: "Σφάλμα κατά την παραγωγή εικόνας." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
