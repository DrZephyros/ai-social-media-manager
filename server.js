import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTopic, generateScript, generateCaption } from './engine.js';
import axios from 'axios';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Store the latest generated script for the publish endpoint
let latestScript = null;

app.post('/api/brainstorm', async (req, res) => {
    try {
        const { genre } = req.body || {};
        if (typeof genre !== 'string' || !genre.trim() || genre.trim().length > 120) {
            return res.status(400).json({ error: 'Select a niche before brainstorming a topic.' });
        }
        console.info(`[brainstorm] received genre ${JSON.stringify(genre.trim())}`);
        const topic = await generateTopic(genre);
        res.json({ topic, genre: genre.trim() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Pexels image search — returns an array of image URLs
app.get('/api/images', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ images: [] });

    const PEXELS_KEY = process.env.PEXELS_API_KEY;
    if (!PEXELS_KEY) {
        console.warn('PEXELS_API_KEY not set — returning empty images');
        return res.json({ images: [] });
    }

    try {
        const response = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
            { headers: { Authorization: PEXELS_KEY } }
        );
        const data = await response.json();
        const images = (data.photos || []).map(p => p.src.large2x || p.src.large);
        res.json({ images });
    } catch (err) {
        console.error('Pexels API error:', err.message);
        res.json({ images: [] });
    }
});

// SSE endpoint: streams status updates then returns the script JSON
app.get('/api/generate-stream', async (req, res) => {
    const topic = req.query.topic;
    const genre = req.query.genre;
    if (!topic) return res.status(400).end();
    if (typeof genre !== 'string' || !genre.trim() || genre.trim().length > 120) {
        return res.status(400).json({ error: 'Select a niche before generating slides.' });
    }
    const selectedGenre = genre.trim();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        send({ status: '🔎 Searching free web sources for this story...' });

        const research = await generateScript(topic, selectedGenre);
        const script = research.slides;
        latestScript = script;

        send({ status: '✍️ Turning the verified facts into a swipe-by-swipe story...' });
        const caption = await generateCaption(topic, script, selectedGenre);

        send({ status: '✅ Script and caption complete! Rendering your slides...' });
        send({
            done: true,
            script,
            caption,
            sources: research.sources,
        });
    } catch (err) {
        send({ error: err.message });
    } finally {
        res.end();
    }
});

// Webhook publish: sends slide files to Make.com via multipart/form-data
app.post('/api/publish', async (req, res) => {
    const WEBHOOK_URL = 'https://hook.eu1.make.com/bnf2aoa3rhlo4epfkq2elitesqgxyxch';
    const { images, caption } = req.body;

    try {
        const form = new FormData();
        form.append('caption', caption || '');

        if (images && images.length > 0) {
            images.forEach((dataUrl, index) => {
                const base64Data = dataUrl.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                // Use images[] so Make.com creates an array of files
                form.append('images[]', buffer, { 
                    filename: `slide-${index + 1}.jpg`, 
                    contentType: 'image/jpeg' 
                });
            });
        }

        const response = await axios.post(WEBHOOK_URL, form, {
            headers: form.getHeaders()
        });

        res.json({ success: true, data: response.data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;
