# Firebase account and generation quota setup

The app now uses Firebase Authentication for email/password accounts and Cloud Firestore for the rolling weekly quota. No phone verification, SMS provider, or SQL migration is needed. Firebase lists email/password Auth as no-cost and Firestore includes daily no-cost quotas (1 GiB stored data, 50,000 reads/day, and 20,000 writes/day). [Firebase pricing](https://firebase.google.com/pricing) [Firestore quotas](https://firebase.google.com/docs/firestore/quotas)

## Firebase setup

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project. Choose the Spark (no-cost) plan; do not enable billing for this setup.
2. In **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, add your production domain and localhost for development.
4. In **Authentication → Templates → Email address verification**, confirm the template is enabled and has a valid sender address. Customize its sender/name and action link as needed; the email is delivered by Firebase Authentication, so check the project's Authentication usage and spam folder if Firebase accepts the request but no message arrives. Firebase's default delivery has project email limits; use a custom SMTP configuration if you need reliable branded delivery or higher throughput.
5. In **Build → Firestore Database**, create the database. Choose a location and start in production mode; this app accesses quota records through the server Admin SDK.
6. In **Project settings → General → Your apps**, register a Web app and copy its Firebase config object.
7. In **Project settings → Service accounts**, generate a private key JSON for server access. Keep this private key secret. Firebase documents the service-account setup for trusted server environments [here](https://firebase.google.com/docs/admin/setup).

## Cloudflare Turnstile

1. Create a free widget at [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) for the production hostname and localhost.
2. Copy its site key and secret key.

## Environment variables

Set these in local .env and in Vercel Environment Variables:

- FIREBASE_PROJECT_ID: Firebase project ID.
- FIREBASE_WEB_CONFIG: the web app config as a single-line JSON object (apiKey, authDomain, projectId, appId, and other values copied from Firebase).
- FIREBASE_SERVICE_ACCOUNT_JSON: the complete service account key JSON on the server only. Never put this in browser config or commit it.
- TURNSTILE_SITE_KEY
- TURNSTILE_SECRET_KEY (server only)

The Firestore generation_quota collection is created automatically after a user’s first generation.

## Quota behavior

A verified account may start two generations in any rolling seven-day window. Failed generation calls release their quota reservation. Each network address is also limited to five generation attempts per hour per server process; the account quota is the durable enforcement layer.

Users must verify their email before generating or downloading. Downloads keep working while signed in. Free-tier limits may change, so review the provider dashboards before launch.
