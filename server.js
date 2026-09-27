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
        const topic = await generateTopic();
        res.json({ topic });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// SSE endpoint: streams status updates then returns the script JSON
app.get('/api/generate-stream', async (req, res) => {
    const topic = req.query.topic;
    if (!topic) return res.status(400).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        send({ status: '🧠 Groq AI is writing your carousel script...' });

        const script = await generateScript(topic);
        latestScript = script;

        send({ status: '✍️ Writing the Instagram caption...' });
        const caption = await generateCaption(topic, script);

        send({ status: '✅ Script and caption complete! Rendering your slides...' });
        send({ done: true, script, caption });
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
