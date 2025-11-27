require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from the root directory

// Local affirmation generator function
function generateLocalAffirmation(text) {
    const affirmations = [
        "You are capable of overcoming any challenge that comes your way.",
        "Your feelings are valid and important. Take time to honor them.",
        "You are growing stronger with each passing day.",
        "Peace comes from within. Do not seek it without.",
        "You have the power to create positive change in your life.",
        "This moment is all there is. Be present and embrace it.",
        "You are worthy of love, kindness, and happiness.",
        "Inhale the future, exhale the past. You are here now.",
        "You are resilient and can handle whatever life brings.",
        "Your journey is unique and beautiful. Trust the process.",
        "You deserve all the good things life has to offer.",
        "Every day is a new opportunity for growth and joy.",
        "You are enough, exactly as you are in this moment.",
        "Your inner strength will guide you through any storm.",
        "Be gentle with yourself. You're doing the best you can."
    ];

    // Try to generate a contextual affirmation based on keywords
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('stress') || lowerText.includes('worried') || lowerText.includes('anxious')) {
        return "Take a deep breath. You have overcome challenges before, and you will overcome this too.";
    } else if (lowerText.includes('sad') || lowerText.includes('hurt') || lowerText.includes('pain')) {
        return "Your feelings matter. Allow yourself to feel, and remember that this too shall pass.";
    } else if (lowerText.includes('grateful') || lowerText.includes('thankful') || lowerText.includes('blessed')) {
        return "Your gratitude is a powerful force. Continue to focus on the positive aspects of your life.";
    } else if (lowerText.includes('happy') || lowerText.includes('joy') || lowerText.includes('excited')) {
        return "Your happiness radiates from within. Continue to nurture this positive energy.";
    } else if (lowerText.includes('goal') || lowerText.includes('dream') || lowerText.includes('future')) {
        return "Your dreams are valid. Take one step at a time, and you will achieve what you set out to do.";
    } else if (lowerText.includes('love') || lowerText.includes('care') || lowerText.includes('heart')) {
        return "Love and kindness flow through you. Remember to extend that same compassion to yourself.";
    }

    // Default: return a random affirmation
    return affirmations[Math.floor(Math.random() * affirmations.length)];
}

app.post('/generate-affirmation', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "No text provided for affirmation generation." });
    }

    // Try Hugging Face API first (optional - will fallback to local if fails)
    const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
    let affirmation = null;

    if (HUGGING_FACE_API_KEY) {
        try {
            // Try multiple endpoint formats
            const endpoints = [
                `https://api-inference.huggingface.co/models/gpt2`,
                `https://router.huggingface.co/models/gpt2`,
                `https://router.huggingface.co/inference/gpt2`
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
                        },
                        body: JSON.stringify({ 
                            inputs: `Generate a positive affirmation based on this journal entry: ${text.substring(0, 200)}` 
                        }),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result && result.length > 0 && result[0].generated_text) {
                            affirmation = result[0].generated_text.replace(/^[^:]*:?\s*/i, '').trim();
                            break; // Success, exit loop
                        }
                    }
                } catch (e) {
                    // Continue to next endpoint
                    continue;
                }
            }
        } catch (error) {
            console.log('Hugging Face API unavailable, using local generator:', error.message);
        }
    }

    // Fallback to local affirmation generator
    if (!affirmation) {
        affirmation = generateLocalAffirmation(text);
    }

    res.json({ affirmation: affirmation });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    // useNewUrlParser: true, // Removed as it's no longer supported
    // useUnifiedTopology: true, // Removed as it's no longer supported
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.error(err));

// Entry Schema
const entrySchema = new mongoose.Schema({
    date: { type: String, required: true },
    moodValue: { type: Number, required: true },
    moodLabel: { type: String, required: true },
    text: { type: String, required: true },
    affirmation: { type: String, required: false },
}, { timestamps: { createdAt: true, updatedAt: false } }); // Add createdAt timestamp

const Entry = mongoose.model('Entry', entrySchema);

// API Endpoints for Entries
app.post('/entries', async (req, res) => {
    try {
        const newEntry = new Entry(req.body);
        await newEntry.save();
        res.status(201).json(newEntry);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get('/entries', async (req, res) => {
    try {
        const entries = await Entry.find().sort({ createdAt: -1 }); // Sort by createdAt
        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/entries/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedEntry = await Entry.findByIdAndDelete(id);
        if (!deletedEntry) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
