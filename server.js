import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTopic, generateScript, generateCaption } from './engine.js';
import axios from 'axios';
import FormData from 'form-data';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import appConfigRouter from './app-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(appConfigRouter);
app.use(express.static(__dirname));

let firebaseServiceAccount = null;
try {
    firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        : null;
} catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', error.message);
}
if (firebaseServiceAccount?.private_key) {
    firebaseServiceAccount.private_key = firebaseServiceAccount.private_key.replace(/\\n/g, '\n');
}
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || firebaseServiceAccount?.project_id;
const firebaseAdminApp = firebaseProjectId && firebaseServiceAccount?.client_email && firebaseServiceAccount?.private_key
    ? (getApps()[0] || initializeApp({ credential: cert(firebaseServiceAccount), projectId: firebaseProjectId }))
    : null;
const firebaseAuth = firebaseAdminApp ? getAuth(firebaseAdminApp) : null;
const firestore = firebaseAdminApp ? getFirestore(firebaseAdminApp) : null;
const ipWindows = new Map();
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_GENERATIONS = 5;

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0];
    return (value || req.socket.remoteAddress || 'unknown').trim();
}

function allowIpGeneration(req) {
    const now = Date.now();
    for (const [ip, window] of ipWindows) {
        if (now - window.startedAt >= IP_WINDOW_MS) ipWindows.delete(ip);
    }
    const ip = clientIp(req);
    const key = createHash('sha256').update(ip).digest('hex');
    const window = ipWindows.get(key);
    if (window && now - window.startedAt < IP_WINDOW_MS && window.count >= IP_MAX_GENERATIONS) return false;
    if (!window || now - window.startedAt >= IP_WINDOW_MS) ipWindows.set(key, { startedAt: now, count: 1 });
    else window.count += 1;
    return true;
}

async function requireVerifiedUser(req, res) {
    if (!firebaseAuth) {
        res.status(503).json({ error: 'Firebase accounts are not configured yet. Add the Firebase project and service-account environment variables.' });
        return null;
    }
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        res.status(401).json({ error: 'Create an account or sign in to continue.' });
        return null;
    }
    let decoded;
    try {
        decoded = await firebaseAuth.verifyIdToken(match[1]);
    } catch {
        res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        return null;
    }
    const user = await firebaseAuth.getUser(decoded.uid);
    if (!user.emailVerified) {
        res.status(403).json({ error: 'Verify your email address before continuing.' });
        return null;
    }
    return { user, token: match[1] };
}

async function reserveGeneration(userId) {
    const ref = firestore.collection('generation_quota').doc(userId);
    const now = Timestamp.now();
    const cutoff = now.toMillis() - 7 * 24 * 60 * 60 * 1000;
    return firestore.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const recent = (snapshot.data()?.recentGenerations || [])
            .filter(item => item?.createdAt?.toMillis?.() > cutoff);
        if (recent.length >= 2) {
            const oldest = recent.reduce((a, b) => a.createdAt.toMillis() < b.createdAt.toMillis() ? a : b);
            return { allowed: false, resetsAt: oldest.createdAt.toMillis() + 7 * 24 * 60 * 60 * 1000 };
        }
        const reservationId = randomUUID();
        recent.push({ id: reservationId, createdAt: now });
        transaction.set(ref, { recentGenerations: recent, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { allowed: true, reservationId };
    });
}

async function releaseGeneration(userId, reservationId) {
    const ref = firestore.collection('generation_quota').doc(userId);
    await firestore.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return;
        const recent = (snapshot.data()?.recentGenerations || []).filter(item => item.id !== reservationId);
        transaction.set(ref, { recentGenerations: recent, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
}

// Store the latest generated script for the publish endpoint
let latestScript = null;

app.post('/api/brainstorm', async (req, res) => {
    try {
        if (!await requireVerifiedUser(req, res)) return;
        if (!allowIpGeneration(req)) return res.status(429).json({ error: 'Too many requests from this network. Please try again later.' });
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
app.post('/api/generation-ticket', async (req, res) => {
    const auth = await requireVerifiedUser(req, res);
    if (!auth) return;
    const { topic, genre } = req.body || {};
    if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) return res.status(400).json({ error: 'Enter a topic up to 500 characters.' });
    if (typeof genre !== 'string' || !genre.trim() || genre.trim().length > 120) return res.status(400).json({ error: 'Select a niche before generating slides.' });
    const payload = Buffer.from(JSON.stringify({ userId: auth.user.uid, topic: topic.trim(), genre: genre.trim(), expiresAt: Date.now() + 60_000 })).toString('base64url');
    const secret = firebaseServiceAccount?.private_key;
    if (!secret) return res.status(503).json({ error: 'Firebase service account is not configured.' });
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    const ticket = `${payload}.${signature}`;
    res.json({ ticket });
});

function readGenerationTicket(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra) return null;
    const expected = createHmac('sha256', firebaseServiceAccount?.private_key || '').update(payload).digest();
    let supplied;
    try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!data.userId || !data.topic || !data.genre || data.expiresAt < Date.now()) return null;
        return data;
    } catch { return null; }
}

app.get('/api/generate-stream', async (req, res) => {
    const ticketValue = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const ticket = readGenerationTicket(ticketValue);
    if (!ticket) return res.status(401).json({ error: 'Generation session expired. Please try again.' });
    const { topic, genre: selectedGenre, userId } = ticket;
    if (!topic) return res.status(400).end();
    if (!allowIpGeneration(req)) return res.status(429).json({ error: 'Too many generations from this network. Please try again in an hour.' });

    let reservation;
    try {
        reservation = await reserveGeneration(userId);
    } catch (quotaError) {
        console.error('Generation quota reservation failed:', quotaError.message);
        return res.status(503).json({ error: 'Could not check your weekly generation limit. Please try again.' });
    }
    if (!reservation?.allowed) {
        return res.status(429).json({ error: `You have used your 2 free generations this week. Your limit resets ${new Date(reservation.resetsAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.` });
    }

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
        await releaseGeneration(userId, reservation.reservationId).catch(() => {});
    } finally {
        res.end();
    }
});

app.post('/api/download-authorize', async (req, res) => {
    const auth = await requireVerifiedUser(req, res);
    if (!auth) return;
    res.json({ ok: true, user: { id: auth.user.uid, email: auth.user.email } });
});

app.post('/api/turnstile/verify', async (req, res) => {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) return res.status(503).json({ error: 'Bot protection is not configured yet.' });
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token) return res.status(400).json({ error: 'Complete the bot check and try again.' });
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ secret, response: token, remoteip: clientIp(req) }),
        });
        const result = await response.json();
        if (!result.success) return res.status(400).json({ error: 'Bot check failed. Please try again.' });
        res.json({ success: true });
    } catch (error) {
        console.error('Turnstile verification failed:', error.message);
        res.status(502).json({ error: 'Could not verify the bot check. Please try again.' });
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
