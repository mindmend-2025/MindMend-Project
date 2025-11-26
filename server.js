// server.js (ESM) — Hugging Face chat integration + robust fallbacks
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HF_API_KEY = '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';
const HF_MODEL = 'google/gemma-2-2b-it';
const HF_INFERENCE_ENDPOINT = 'https://router.huggingface.co/models/';

console.log('-----------------------------------');
console.log('Server config:');
console.log('HF_API_KEY present:', !!HF_API_KEY);
console.log('HF_MODEL:', HF_MODEL);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serves your HTML/CSS/JS

// --- MONGODB CONNECTION ---
// await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mindmend')
//     .then(() => console.log('✅ Connected to MongoDB'))
//     .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- DATA MODEL ---
// const EntrySchema = new mongoose.Schema({
//     date: String,         // Format: YYYY-MM-DD
//     timestamp: String,    // ISO String
//     moodValue: Number,
//     moodLabel: String,
//     text: String,
//     affirmation: String
// });
// const Entry = mongoose.model('Entry', EntrySchema);

// small set of deterministic fallback affirmations (used if API fails)
const FALLBACKS = [
  "Gentle reminder: breathe — you are enough in this moment.",
  "You are allowed to rest and still be proud of the progress you've made.",
  "One small step counts; you are moving forward."
];

async function callHuggingFaceChat(promptText) {
  if (!HF_API_KEY) throw new Error('HF_API_KEY is not set');
  if (!HF_MODEL) throw new Error('HF_MODEL is not set');

  const fullEndpoint = `${HF_INFERENCE_ENDPOINT}${HF_MODEL}`;

  const body = {
    inputs: promptText,
    parameters: {
      max_new_tokens: 120,
      temperature: 0.8,
      return_full_text: false // Only return generated text
    }
  };

  const res = await fetch(fullEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HF_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();
  let json;
  try { json = JSON.parse(rawText); } catch (e) { json = rawText; }

  return { status: res.status, ok: res.ok, raw: json };
}

function extractAffirmationFromHuggingFaceResponse(resp) {
  try {
    if (!resp || !Array.isArray(resp) || !resp.length) return '';
    const firstResult = resp[0];
    if (firstResult && typeof firstResult.generated_text === 'string') {
      return firstResult.generated_text.trim();
    }
    return '';
  } catch (e) {
    return '';
  }
}

// --- API ROUTES ---

// // GET entries
// app.get('/api/entries', async (req, res) => {
//   try {
//     const entries = await Entry.find().sort({ timestamp: -1 });
//     res.json(entries);
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch entries' });
//   }
// });

// // POST entry (AI + save)
// app.post('/api/entries', async (req, res) => {
//   try {
//     const { moodValue, moodLabel, text, date } = req.body;
//     if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });

//     console.log('📝 Received entry:', { moodLabel, text: String(text).slice(0,120) });

//     // Build prompt
//     const prompt = `You are gentle. User mood: ${moodLabel} (${moodValue}/100). Entry: "${text}". Produce one short affirmation, one sentence, no quotes.`;

//     let affirmation = '';
//     let huggingfaceRaw = null;
//     try {
//       // if (!process.env.HF_API_KEY) throw new Error('HF_API_KEY missing');
//       // if (!process.env.HF_MODEL) throw new Error('HF_MODEL missing');

//       const r = await callHuggingFaceChat(prompt);
//       huggingfaceRaw = r.raw;

//       console.log('Hugging Face HTTP status:', r.status);
//       console.log('Hugging Face raw preview:', (typeof huggingfaceRaw === 'string' ? huggingfaceRaw.slice(0,1000) : JSON.stringify(huggingfaceRaw).slice(0,1200)));

//       // extract
//       if (huggingfaceRaw) {
//         affirmation = extractAffirmationFromHuggingFaceResponse(huggingfaceRaw);
//       }
//     } catch (apiErr) {
//       console.error('Hugging Face call error:', apiErr?.message || apiErr);
//     }

//     if (!affirmation) {
//       affirmation = FALLBACKS[Math.floor(Date.now() / 1000) % FALLBACKS.length];
//       console.log('Using fallback affirmation:', affirmation);
//     } else {
//       console.log('Affirmation from API:', affirmation.slice(0,200));
//     }

//     // Save to DB
//     const newEntry = new Entry({
//       date,
//       timestamp: new Date().toISOString(),
//       moodValue,
//       moodLabel,
//       text,
//       affirmation
//     });

//     await newEntry.save();
//     console.log('💾 Saved entry id:', newEntry._id);

//     // return server-side debug info (without exposing API key)
//     return res.status(201).json({ saved: true, entry: newEntry, huggingfaceStatus: huggingfaceRaw ? 'present' : 'none' });
//   } catch (err) {
//     console.error('POST /api/entries ERROR full:', err);
//     return res.status(500).json({ error: err.message || 'Server error' });
//   }
// });


// DELETE entry
// app.delete('/api/entries/:id', async (req, res) => {
//   try {
//     await Entry.findOneAndDelete({ timestamp: req.params.id });
//     res.json({ message: 'Deleted' });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to delete' });
//   }
// });

// // Nuke DB (dev)
// app.get('/api/nuke', async (req, res) => {
//   await Entry.deleteMany({});
//   res.send('Database cleared.');
// });

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});