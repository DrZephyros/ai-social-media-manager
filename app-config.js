import express from 'express';

const router = express.Router();
router.get('/app-config.js', (_req, res) => {
    const config = {
        firebaseConfig: JSON.parse(process.env.FIREBASE_WEB_CONFIG || '{}'),
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    };
    res.type('application/javascript').send(`window.APP_CONFIG = ${JSON.stringify(config).replace(/</g, '\\u003c')};`);
});

export default router;
