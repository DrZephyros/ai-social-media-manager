import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTopic, generateScript, generateCaption } from './engine.js';
import axios from 'axios';
import FormData from 'form-data';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const generationTicketSecret = process.env.GENERATION_TICKET_SECRET?.trim() || supabaseSecretKey;
const supabaseConfigured = Boolean(supabaseUrl && supabaseSecretKey);

function createSupabaseClient() {
    if (!supabaseConfigured) return null;
    return createClient(supabaseUrl, supabaseSecretKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}
const ipWindows = new Map();
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_GENERATIONS = 5;
const PREMIUM_EMAILS = new Set(['gowthamsanjay2028@gmail.com']);

function isPremiumUser(user) {
    return PREMIUM_EMAILS.has(String(user?.email || '').trim().toLowerCase());
}

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

async function requireAuthenticatedUser(req, res) {
    if (!supabaseConfigured) {
        res.status(503).json({ error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.' });
        return null;
    }
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        res.status(401).json({ error: 'Create an account or sign in to continue.' });
        return null;
    }
    const supabase = createSupabaseClient();
    try {
        const { data, error } = await supabase.auth.getUser(match[1]);
        if (error || !data.user) throw error || new Error('No user in session');
        return { user: { uid: data.user.id, email: data.user.email || null, premium: isPremiumUser(data.user) }, token: match[1] };
    } catch {
        res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        return null;
    }
}

async function reserveGeneration(userId) {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('reserve_generation', { p_user_id: userId });
    if (error) throw error;
    return data;
}

async function releaseGeneration(userId, reservationId) {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.rpc('release_generation', {
        p_user_id: userId,
        p_reservation_id: reservationId,
    });
    if (error) throw error;
}

/** Strip legacy "Firebase:" prefix and translate common auth error codes into friendly messages. */
function friendlyAuthError(rawMessage) {
    let msg = (rawMessage || 'Something went wrong.').replace(/^Firebase:\s*/i, '').trim();
    if (/email.*(already|in use|exists)|duplicate.*email|already.*registered/i.test(msg)) {
        return 'An account with this email already exists. Try signing in instead.';
    }
    if (/invalid.*password|wrong.*password/i.test(msg)) {
        return 'The password is incorrect. Please try again.';
    }
    if (/user.*not.*found|no.*user/i.test(msg)) {
        return 'No account found with this email. Create one first.';
    }
    // Strip trailing Firebase error codes like (auth/email-already-in-use)
    msg = msg.replace(/\s*\(auth\/[^)]+\)\s*\.?$/, '').trim();
    return msg || 'Something went wrong.';
}

app.post('/api/auth/signup', async (req, res) => {
    if (!supabaseConfigured) return res.status(503).json({ error: 'Supabase is not configured yet.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const supabase = createSupabaseClient();
    try {
        const { error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
        if (createError) return res.status(400).json({ error: friendlyAuthError(createError.message) });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) return res.status(401).json({ error: friendlyAuthError(error?.message) || 'Account was created but could not be signed in.' });
        res.json({ session: data.session, user: { id: data.user.id, email: data.user.email } });
    } catch (error) {
        console.error('Supabase signup failed:', error.message);
        res.status(500).json({ error: 'Could not create your account right now.' });
    }
});

app.post('/api/auth/signin', async (req, res) => {
    if (!supabaseConfigured) return res.status(503).json({ error: 'Supabase is not configured yet.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    try {
        const { data, error } = await createSupabaseClient().auth.signInWithPassword({ email, password });
        if (error || !data.session) return res.status(401).json({ error: friendlyAuthError(error?.message) || 'Could not sign in.' });
        res.json({ session: data.session, user: { id: data.user.id, email: data.user.email } });
    } catch (error) {
        console.error('Supabase sign-in failed:', error.message);
        res.status(500).json({ error: 'Could not sign in right now.' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    if (!supabaseConfigured) return res.status(503).json({ error: 'Supabase is not configured yet.' });
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    if (!refreshToken) return res.status(400).json({ error: 'Session refresh token is required.' });
    try {
        const { data, error } = await createSupabaseClient().auth.refreshSession({ refresh_token: refreshToken });
        if (error || !data.session) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
        res.json({ session: data.session, user: { id: data.user.id, email: data.user.email } });
    } catch (error) {
        console.error('Supabase session refresh failed:', error.message);
        res.status(500).json({ error: 'Could not refresh your session.' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    const auth = await requireAuthenticatedUser(req, res);
    if (!auth) return;
    res.json({ user: { id: auth.user.uid, email: auth.user.email } });
});

app.post('/api/auth/signout', async (req, res) => {
    if (!supabaseConfigured) return res.json({ ok: true });
    const accessToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    if (accessToken && refreshToken) {
        try {
            const supabase = createSupabaseClient();
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            await supabase.auth.signOut({ scope: 'local' });
        } catch (error) {
            console.warn('Supabase sign-out revoke failed:', error.message);
        }
    }
    res.json({ ok: true });
});

// Store the latest generated script for the publish endpoint
let latestScript = null;

app.post('/api/brainstorm', async (req, res) => {
    try {
        if (!await requireAuthenticatedUser(req, res)) return;
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
    const auth = await requireAuthenticatedUser(req, res);
    if (!auth) return;
    const { topic, genre } = req.body || {};
    if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) return res.status(400).json({ error: 'Enter a topic up to 500 characters.' });
    if (typeof genre !== 'string' || !genre.trim() || genre.trim().length > 120) return res.status(400).json({ error: 'Select a niche before generating slides.' });
    const payload = Buffer.from(JSON.stringify({ userId: auth.user.uid, premium: auth.user.premium, topic: topic.trim(), genre: genre.trim(), expiresAt: Date.now() + 60_000 })).toString('base64url');
    if (!generationTicketSecret) return res.status(503).json({ error: 'Generation signing secret is not configured.' });
    const signature = createHmac('sha256', generationTicketSecret).update(payload).digest('base64url');
    const ticket = `${payload}.${signature}`;
    res.json({ ticket });
});

function readGenerationTicket(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra) return null;
    const expected = createHmac('sha256', generationTicketSecret || '').update(payload).digest();
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const keepAlive = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, 15000);
    keepAlive.unref?.();
    res.on('close', () => clearInterval(keepAlive));
    let userId = null;
    let reservation = null;

    try {
        const ticketValue = typeof req.query.ticket === 'string' ? req.query.ticket : '';
        const ticket = readGenerationTicket(ticketValue);
        if (!ticket) {
            send({ error: 'Generation session expired. Please try again.' });
            return;
        }

        const { topic, genre: selectedGenre } = ticket;
        userId = ticket.userId;
        if (!topic) {
            send({ error: 'Enter a topic before generating slides.' });
            return;
        }

        const premiumUser = ticket.premium === true;
        if (!premiumUser) {
            try {
                reservation = await reserveGeneration(userId);
            } catch (quotaError) {
                console.error('Generation quota reservation failed:', quotaError.message);
                send({ error: 'Could not check your generation limit. Please try again.' });
                return;
            }
            if (!reservation?.allowed) {
                send({ error: `You have used your 2 free generations for this 3-day period. Your limit resets ${new Date(reservation.resetsAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.` });
                return;
            }
        }
        if (!premiumUser && !allowIpGeneration(req)) {
            if (reservation?.reservationId) await releaseGeneration(userId, reservation.reservationId).catch(() => {});
            reservation = null;
            send({ error: 'Too many generations from this network. Please try again in an hour.' });
            return;
        }

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
        console.error('Carousel generation failed:', err);
        send({ error: err.message || 'Carousel generation failed. Please try again.' });
        if (userId && reservation?.reservationId) await releaseGeneration(userId, reservation.reservationId).catch(() => {});
    } finally {
        clearInterval(keepAlive);
        res.end();
    }
});

app.post('/api/download-authorize', async (req, res) => {
    const auth = await requireAuthenticatedUser(req, res);
    if (!auth) return;
    res.json({ ok: true, user: { id: auth.user.uid, email: auth.user.email } });
});

app.get('/api/generation-quota', async (req, res) => {
    let stage = 'authentication';
    try {
        const auth = await requireAuthenticatedUser(req, res);
        if (!auth) return;
        if (isPremiumUser(auth.user)) {
            return res.json({ premium: true, limit: null, used: 0, remaining: null, nextRenewalAt: null, serverTime: Date.now() });
        }
        stage = 'Supabase configuration';
        const supabase = createSupabaseClient();
        if (!supabase) return res.status(503).json({ error: 'Generation quota is not available right now.' });
        stage = 'Supabase read';
        const now = Date.now();
        const quotaPeriodMs = 3 * 24 * 60 * 60 * 1000;
        const cutoff = new Date(now - quotaPeriodMs).toISOString();
        const { data, error } = await supabase.from('generation_quota')
            .select('created_at')
            .eq('user_id', auth.user.uid)
            .gt('created_at', cutoff)
            .order('created_at', { ascending: true });
        if (error) throw error;
        stage = 'quota formatting';
        const recent = data || [];
        const nextRenewalAt = recent.length ? new Date(recent[0].created_at).getTime() + quotaPeriodMs : null;
        res.json({
            premium: false,
            limit: 2,
            used: recent.length,
            remaining: Math.max(0, 2 - recent.length),
            nextRenewalAt,
            serverTime: now,
        });
    } catch (error) {
        console.error(`Generation quota request failed during ${stage}:`, error);
        if (!res.headersSent) res.status(500).json({ error: `Quota request failed during ${stage} (${error.code || 'internal-error'}).` });
    }
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
